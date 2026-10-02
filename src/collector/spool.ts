import Database from 'better-sqlite3';
import { existsSync, statSync } from 'node:fs';
import { batchChecksum, newId } from '../core/crypto.js';
import {
  collectorDeviceConfigurationSchema,
  ingestBatchSchema,
  type CgnatEvent,
  type CollectorDeviceConfiguration,
  type IngestBatch,
  type RawRecord
} from '../domain/models.js';
import type { NetflowTemplate, NetflowTemplateStore } from '../parsers/netflow-v9.js';
import type { PacketParser } from '../parsers/parser.js';

interface SpoolRow {
  sequence: number;
  raw_id: string;
  raw_json: string;
  events_json: string;
}

interface BatchRow {
  batch_id: string;
  checksum: string;
  created_at: string;
}

const DEFAULT_DESTINATION_ID = 'primary';

export interface SpoolIdentity {
  tenantId: string;
  collectorId: string;
}

export interface ManagedCloudReconciliation {
  identitiesRemoved: number;
  recordsRemoved: number;
  batchesRemoved: number;
  templatesRemoved: number;
}

export interface SpoolStatistics {
  pendingRecords: number;
  pendingEvents: number;
  pendingBatches: number;
  acknowledgedRecordsRetained: number;
  oldestPendingAt: string | null;
  spoolBytes: number;
  lastSyncAt: string | null;
  lastSyncError: string;
}

export interface RequeuedDeliverySummary {
  destinationId: string;
  batches: number;
  records: number;
  events: number;
}

export interface DeliveryGroupLimits {
  maxBatches: number;
  maxRawRecords: number;
  maxEvents: number;
  maxBytes: number;
}

export class CollectorSpool implements NetflowTemplateStore {
  private readonly db: Database.Database;

  constructor(private readonly path: string) {
    this.db = new Database(path);
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.pragma('foreign_keys = ON');
    this.initialize();
  }

  close(): void {
    this.db.close();
  }

  append(raw: RawRecord, events: CgnatEvent[]): number {
    const transaction = this.db.transaction(() => {
      const result = this.db.prepare(`
        INSERT INTO raw_spool
          (raw_id, raw_json, events_json, state, created_at, tenant_id, collector_id)
        VALUES (?, ?, ?, 'pending', ?, ?, ?)
      `).run(
        raw.rawId,
        JSON.stringify(raw),
        JSON.stringify(events),
        raw.receivedAt,
        raw.tenantId,
        raw.collectorId
      );
      const sequence = Number(result.lastInsertRowid);
      const storedRaw = { ...raw, localSequence: sequence };
      this.db.prepare('UPDATE raw_spool SET raw_json = ? WHERE sequence = ?')
        .run(JSON.stringify(storedRaw), sequence);
      return sequence;
    });
    return transaction();
  }

  configureDestinations(destinationIds: string[]): void {
    const normalized = [...new Set(destinationIds.map((value) => value.trim()).filter(Boolean))];
    if (!normalized.length) normalized.push(DEFAULT_DESTINATION_ID);
    for (const destinationId of normalized) {
      if (!/^[A-Za-z0-9._-]{1,100}$/.test(destinationId)) throw new Error(`Destino de sincronização inválido: ${destinationId}`);
    }
    this.db.transaction(() => {
      this.db.prepare('UPDATE sync_destinations SET active = 0').run();
      const upsert = this.db.prepare(`
        INSERT INTO sync_destinations (destination_id, active, updated_at)
        VALUES (?, 1, ?)
        ON CONFLICT (destination_id) DO UPDATE SET active = 1, updated_at = excluded.updated_at
      `);
      const createDelivery = this.db.prepare(`
        INSERT INTO sync_batch_deliveries (batch_id, destination_id, status, attempts)
        SELECT batch_id, ?, 'pending', 0
        FROM sync_batches
        WHERE status = 'pending'
        ON CONFLICT (batch_id, destination_id) DO NOTHING
      `);
      const now = new Date().toISOString();
      for (const destinationId of normalized) {
        upsert.run(destinationId, now);
        createDelivery.run(destinationId);
      }
      this.acknowledgeBatchesWithoutPendingDestinations(now);
    })();
  }

  pendingBatches(
    destinationId = DEFAULT_DESTINATION_ID,
    limits: DeliveryGroupLimits = {
      maxBatches: 100,
      maxRawRecords: 25000,
      maxEvents: 250000,
      maxBytes: 32 * 1024 * 1024
    },
    identity?: SpoolIdentity
  ): IngestBatch[] {
    this.ensureDestination(destinationId);
    const safeBatchLimit = Math.max(1, Math.min(100, Math.trunc(limits.maxBatches)));
    const identityFilter = identity
      ? 'AND batches.tenant_id = ? AND batches.collector_id = ?'
      : '';
    const parameters = identity
      ? [destinationId, identity.tenantId, identity.collectorId, safeBatchLimit]
      : [destinationId, safeBatchLimit];
    const rows = this.db.prepare(`
      SELECT batches.batch_id, batches.checksum, batches.created_at
      FROM sync_batches batches
      JOIN sync_batch_deliveries deliveries ON deliveries.batch_id = batches.batch_id
      WHERE batches.status = 'pending'
        AND deliveries.destination_id = ?
        AND deliveries.status = 'pending'
        ${identityFilter}
      ORDER BY
        deliveries.last_attempt_at IS NOT NULL,
        deliveries.last_attempt_at,
        batches.created_at,
        batches.batch_id
      LIMIT ?
    `).all(...parameters) as BatchRow[];
    if (!rows.length) return [];

    const selected: IngestBatch[] = [];
    let rawRecords = 0;
    let events = 0;
    let bytes = 0;
    let groupIdentity: string | undefined;
    for (const row of rows) {
      const batch = this.buildBatch(row);
      const batchIdentity = this.identityKey(batch);
      if (groupIdentity && batchIdentity !== groupIdentity) continue;
      const batchBytes = Buffer.byteLength(JSON.stringify(batch));
      const exceedsLimit = selected.length > 0 && (
        rawRecords + batch.rawRecords.length > limits.maxRawRecords
        || events + batch.events.length > limits.maxEvents
        || bytes + batchBytes > limits.maxBytes
      );
      if (exceedsLimit) break;
      groupIdentity = batchIdentity;
      selected.push(batch);
      rawRecords += batch.rawRecords.length;
      events += batch.events.length;
      bytes += batchBytes;
    }
    return selected;
  }

  nextBatch(
    limit: number,
    destinationId = DEFAULT_DESTINATION_ID,
    identity?: SpoolIdentity
  ): IngestBatch | undefined {
    this.ensureDestination(destinationId);
    const identityFilter = identity
      ? 'AND batches.tenant_id = ? AND batches.collector_id = ?'
      : '';
    const deliveryParameters = identity
      ? [destinationId, identity.tenantId, identity.collectorId]
      : [destinationId];
    const fresh = this.db.prepare(`
      SELECT batches.batch_id, batches.checksum, batches.created_at
      FROM sync_batches batches
      JOIN sync_batch_deliveries deliveries ON deliveries.batch_id = batches.batch_id
      WHERE batches.status = 'pending'
        AND deliveries.destination_id = ?
        AND deliveries.status = 'pending'
        AND deliveries.last_attempt_at IS NULL
        ${identityFilter}
      ORDER BY batches.created_at
      LIMIT 1
    `).get(...deliveryParameters) as BatchRow | undefined;
    if (fresh) return this.buildBatch(fresh);

    const transaction = this.db.transaction(() => {
      // Uma entrega pendente em outro destino não pode impedir a formação de
      // novos lotes para os destinos que continuam disponíveis.
      const selectedIdentity = identity
        ? this.db.prepare(`
            SELECT ? AS tenant_id, ? AS collector_id
            WHERE EXISTS (
              SELECT 1 FROM raw_spool
              WHERE state = 'pending'
                AND COALESCE(tenant_id, json_extract(raw_json, '$.tenantId')) = ?
                AND COALESCE(collector_id, json_extract(raw_json, '$.collectorId')) = ?
            )
          `).get(identity.tenantId, identity.collectorId, identity.tenantId, identity.collectorId)
        : this.db.prepare(`
            SELECT
              COALESCE(tenant_id, json_extract(raw_json, '$.tenantId')) AS tenant_id,
              COALESCE(collector_id, json_extract(raw_json, '$.collectorId')) AS collector_id
            FROM raw_spool
            WHERE state = 'pending'
            ORDER BY sequence
            LIMIT 1
          `).get();
      const pendingIdentity = selectedIdentity as { tenant_id: string; collector_id: string } | undefined;
      if (pendingIdentity) {
        const rows = this.db.prepare(`
          SELECT sequence, raw_id, raw_json, events_json
          FROM raw_spool
          WHERE state = 'pending'
            AND COALESCE(tenant_id, json_extract(raw_json, '$.tenantId')) = ?
            AND COALESCE(collector_id, json_extract(raw_json, '$.collectorId')) = ?
          ORDER BY sequence
          LIMIT ?
        `).all(pendingIdentity.tenant_id, pendingIdentity.collector_id, limit) as SpoolRow[];
        if (rows.length) {
          const batchId = newId();
          const rawRecords = rows.map((row) => JSON.parse(row.raw_json) as RawRecord);
          const events = rows.flatMap((row) => JSON.parse(row.events_json) as CgnatEvent[]);
          const checksum = batchChecksum(rawRecords, events);
          const createdAt = new Date().toISOString();
          this.db.prepare(`
            INSERT INTO sync_batches
              (batch_id, checksum, status, attempts, created_at, tenant_id, collector_id)
            VALUES (?, ?, 'pending', 0, ?, ?, ?)
          `).run(batchId, checksum, createdAt, pendingIdentity.tenant_id, pendingIdentity.collector_id);
          this.db.prepare(`
            INSERT INTO sync_batch_deliveries (batch_id, destination_id, status, attempts)
            SELECT ?, destination_id, 'pending', 0 FROM sync_destinations WHERE active = 1
          `).run(batchId);
          const assign = this.db.prepare(`
            UPDATE raw_spool SET state = 'batched', batch_id = ? WHERE sequence = ?
          `);
          for (const row of rows) assign.run(batchId, row.sequence);
          return this.buildBatch({ batch_id: batchId, checksum, created_at: createdAt });
        }
      }

      const retry = this.db.prepare(`
        SELECT batches.batch_id, batches.checksum, batches.created_at
        FROM sync_batches batches
        JOIN sync_batch_deliveries deliveries ON deliveries.batch_id = batches.batch_id
        WHERE batches.status = 'pending'
          AND deliveries.destination_id = ?
          AND deliveries.status = 'pending'
          ${identityFilter}
        ORDER BY deliveries.last_attempt_at, batches.created_at
        LIMIT 1
      `).get(...deliveryParameters) as BatchRow | undefined;
      return retry ? this.buildBatch(retry) : undefined;
    });
    return transaction();
  }

  reconcileManagedCloudIdentities(
    activeIdentities: SpoolIdentity[],
    protectedIdentity: SpoolIdentity
  ): ManagedCloudReconciliation {
    const active = new Set(activeIdentities.map((identity) => this.identityKey(identity)));
    active.add(this.identityKey(protectedIdentity));
    const stored = this.db.prepare(`
      SELECT DISTINCT
        COALESCE(tenant_id, json_extract(raw_json, '$.tenantId')) AS tenant_id,
        COALESCE(collector_id, json_extract(raw_json, '$.collectorId')) AS collector_id
      FROM raw_spool
      WHERE COALESCE(tenant_id, json_extract(raw_json, '$.tenantId')) IS NOT NULL
        AND COALESCE(collector_id, json_extract(raw_json, '$.collectorId')) IS NOT NULL
      UNION
      SELECT DISTINCT tenant_id, collector_id
      FROM sync_batches
      WHERE tenant_id IS NOT NULL AND collector_id IS NOT NULL
    `).all() as Array<{ tenant_id: string; collector_id: string }>;
    const obsolete = stored.filter((identity) => !active.has(this.identityKey({
      tenantId: identity.tenant_id,
      collectorId: identity.collector_id
    })));

    return this.db.transaction(() => {
      let recordsRemoved = 0;
      let batchesRemoved = 0;
      let templatesRemoved = 0;
      for (const identity of obsolete) {
        const batchIds = this.db.prepare(`
          SELECT DISTINCT batch_id
          FROM raw_spool
          WHERE batch_id IS NOT NULL
            AND COALESCE(tenant_id, json_extract(raw_json, '$.tenantId')) = ?
            AND COALESCE(collector_id, json_extract(raw_json, '$.collectorId')) = ?
        `).all(identity.tenant_id, identity.collector_id) as Array<{ batch_id: string }>;
        recordsRemoved += this.db.prepare(`
          DELETE FROM raw_spool
          WHERE COALESCE(tenant_id, json_extract(raw_json, '$.tenantId')) = ?
            AND COALESCE(collector_id, json_extract(raw_json, '$.collectorId')) = ?
        `).run(identity.tenant_id, identity.collector_id).changes;
        batchesRemoved += this.db.prepare(`
          DELETE FROM sync_batches WHERE tenant_id = ? AND collector_id = ?
        `).run(identity.tenant_id, identity.collector_id).changes;
        const deleteLegacyBatch = this.db.prepare('DELETE FROM sync_batches WHERE batch_id = ?');
        for (const batch of batchIds) batchesRemoved += deleteLegacyBatch.run(batch.batch_id).changes;
        templatesRemoved += this.db.prepare(`
          DELETE FROM netflow_templates WHERE exporter_ip LIKE ?
        `).run(`${identity.collector_id}:%`).changes;
      }
      return {
        identitiesRemoved: obsolete.length,
        recordsRemoved,
        batchesRemoved,
        templatesRemoved
      };
    })();
  }

  acknowledge(
    batchId: string,
    acknowledgedAt = new Date().toISOString(),
    destinationId = DEFAULT_DESTINATION_ID
  ): void {
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE sync_batch_deliveries
        SET status = 'acked', acked_at = ?, last_error = ''
        WHERE batch_id = ? AND destination_id = ?
      `).run(acknowledgedAt, batchId, destinationId);
      this.acknowledgeBatchesWithoutPendingDestinations(acknowledgedAt, batchId);
    })();
  }

  recordFailure(batchId: string, error: string, destinationId = DEFAULT_DESTINATION_ID): void {
    const message = error.slice(0, 4000);
    const attemptedAt = new Date().toISOString();
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE sync_batch_deliveries
        SET attempts = attempts + 1, last_error = ?, last_attempt_at = ?
        WHERE batch_id = ? AND destination_id = ?
      `).run(message, attemptedAt, batchId, destinationId);
      this.db.prepare(`
        UPDATE sync_batches
        SET attempts = attempts + 1, last_error = ?, last_attempt_at = ?
        WHERE batch_id = ?
      `).run(`[${destinationId}] ${message}`, attemptedAt, batchId);
    })();
  }

  requeueAcknowledged(destinationId: string): RequeuedDeliverySummary {
    this.ensureDestination(destinationId);
    return this.db.transaction(() => {
      const batches = this.db.prepare(`
        SELECT deliveries.batch_id
        FROM sync_batch_deliveries deliveries
        JOIN sync_batches batches ON batches.batch_id = deliveries.batch_id
        WHERE deliveries.destination_id = ?
          AND deliveries.status = 'acked'
          AND EXISTS (SELECT 1 FROM raw_spool raw WHERE raw.batch_id = batches.batch_id)
        ORDER BY batches.created_at
      `).all(destinationId) as Array<{ batch_id: string }>;
      const updateDelivery = this.db.prepare(`
        UPDATE sync_batch_deliveries
        SET status = 'pending', attempts = 0, last_error = '', last_attempt_at = NULL, acked_at = NULL
        WHERE batch_id = ? AND destination_id = ? AND status = 'acked'
      `);
      const updateBatch = this.db.prepare(`
        UPDATE sync_batches
        SET status = 'pending', last_error = '', last_attempt_at = NULL, acked_at = NULL
        WHERE batch_id = ?
      `);
      const updateRaw = this.db.prepare(`
        UPDATE raw_spool SET state = 'batched', acked_at = NULL
        WHERE batch_id = ? AND state = 'acked'
      `);
      let records = 0;
      let events = 0;
      const batchContents = this.db.prepare(`
        SELECT count(*) AS records, COALESCE(sum(json_array_length(events_json)), 0) AS events
        FROM raw_spool WHERE batch_id = ?
      `);
      for (const batch of batches) {
        const counts = batchContents.get(batch.batch_id) as { records: number; events: number };
        records += Number(counts.records);
        events += Number(counts.events);
        updateDelivery.run(batch.batch_id, destinationId);
        updateBatch.run(batch.batch_id);
        updateRaw.run(batch.batch_id);
      }
      return { destinationId, batches: batches.length, records, events };
    })();
  }

  cleanupAcknowledged(retentionHours: number): number {
    const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000).toISOString();
    return this.db.transaction(() => {
      const deleted = this.db.prepare(`DELETE FROM raw_spool WHERE state = 'acked' AND acked_at < ?`).run(cutoff);
      this.db.prepare(`DELETE FROM sync_batches WHERE status = 'acked' AND acked_at < ?`).run(cutoff);
      return deleted.changes;
    })();
  }

  statistics(tenantId?: string, collectorId?: string): SpoolStatistics {
    const scoped = Boolean(tenantId && collectorId);
    const rawFilter = scoped ? `
      WHERE
        (tenant_id = ? AND collector_id = ?)
        OR
        (tenant_id IS NULL AND collector_id IS NULL
          AND json_extract(raw_json, '$.tenantId') = ?
          AND json_extract(raw_json, '$.collectorId') = ?)
    ` : '';
    const rawParameters = scoped ? [tenantId, collectorId, tenantId, collectorId] : [];
    const records = this.db.prepare(`
      SELECT
        COALESCE(sum(CASE WHEN state <> 'acked' THEN 1 ELSE 0 END), 0) AS pending_records,
        COALESCE(sum(CASE WHEN state <> 'acked' THEN json_array_length(events_json) ELSE 0 END), 0) AS pending_events,
        COALESCE(sum(CASE WHEN state = 'acked' THEN 1 ELSE 0 END), 0) AS acknowledged_records_retained,
        min(CASE WHEN state <> 'acked' THEN created_at END) AS oldest_pending_at,
        COALESCE(sum(length(CAST(raw_json AS BLOB)) + length(CAST(events_json AS BLOB))), 0) AS logical_spool_bytes
      FROM raw_spool
      ${rawFilter}
    `).get(...rawParameters) as {
      pending_records: number;
      pending_events: number;
      acknowledged_records_retained: number;
      oldest_pending_at: string | null;
      logical_spool_bytes: number;
    };
    const batchFilter = scoped ? `
      WHERE (
        (tenant_id = ? AND collector_id = ?)
        OR
        (tenant_id IS NULL AND collector_id IS NULL AND EXISTS (
          SELECT 1
          FROM raw_spool legacy
          WHERE legacy.batch_id = sync_batches.batch_id
            AND COALESCE(legacy.tenant_id, json_extract(legacy.raw_json, '$.tenantId')) = ?
            AND COALESCE(legacy.collector_id, json_extract(legacy.raw_json, '$.collectorId')) = ?
        ))
      )
    ` : '';
    const batchParameters = scoped ? [tenantId, collectorId, tenantId, collectorId] : [];
    const batches = this.db.prepare(`
      SELECT
        COALESCE(sum(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_batches,
        max(CASE WHEN status = 'acked' THEN acked_at END) AS last_sync_at
      FROM sync_batches
      ${batchFilter}
    `).get(...batchParameters) as { pending_batches: number; last_sync_at: string | null };
    const failed = this.db.prepare(`
      SELECT last_error
      FROM sync_batches
      ${scoped ? `${batchFilter} AND` : 'WHERE'} status = 'pending' AND last_error <> ''
      ORDER BY COALESCE(last_attempt_at, created_at) DESC
      LIMIT 1
    `).get(...batchParameters) as { last_error: string } | undefined;
    const spoolBytes = scoped
      ? Number(records.logical_spool_bytes)
      : [this.path, `${this.path}-wal`, `${this.path}-shm`]
          .reduce((total, file) => total + (existsSync(file) ? statSync(file).size : 0), 0);
    return {
      pendingRecords: Number(records.pending_records),
      pendingEvents: Number(records.pending_events),
      pendingBatches: Number(batches.pending_batches),
      acknowledgedRecordsRetained: Number(records.acknowledged_records_retained),
      oldestPendingAt: records.oldest_pending_at,
      spoolBytes,
      lastSyncAt: batches.last_sync_at,
      lastSyncError: failed?.last_error ?? ''
    };
  }

  loadDeviceRegistry(): CollectorDeviceConfiguration[] | undefined {
    const row = this.db.prepare('SELECT devices_json FROM device_registry WHERE singleton = 1')
      .get() as { devices_json: string } | undefined;
    if (!row) return undefined;
    try {
      return collectorDeviceConfigurationSchema.array().max(1000).parse(JSON.parse(row.devices_json));
    } catch {
      return undefined;
    }
  }

  saveDeviceRegistry(devices: CollectorDeviceConfiguration[]): void {
    const validated = collectorDeviceConfigurationSchema.array().max(1000).parse(devices);
    this.db.prepare(`
      INSERT INTO device_registry (singleton, devices_json, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT (singleton) DO UPDATE SET
        devices_json = excluded.devices_json,
        updated_at = excluded.updated_at
    `).run(JSON.stringify(validated), new Date().toISOString());
  }

  reprocessAcknowledged(
    parser: PacketParser,
    predicate: (raw: RawRecord) => boolean,
    transform?: (raw: RawRecord, payload: Buffer) => RawRecord
  ): { examined: number; requeuedRecords: number; generatedEvents: number } {
    const rows = this.db.prepare(`
      SELECT sequence, raw_id, raw_json, events_json
      FROM raw_spool
      WHERE state = 'acked'
      ORDER BY sequence
    `).all() as SpoolRow[];
    let examined = 0;
    let requeuedRecords = 0;
    let generatedEvents = 0;
    const update = this.db.prepare(`
      UPDATE raw_spool
      SET raw_json = ?, events_json = ?, state = 'pending', batch_id = NULL, acked_at = NULL
      WHERE sequence = ? AND state = 'acked'
    `);

    this.db.transaction(() => {
      for (const row of rows) {
        const raw = JSON.parse(row.raw_json) as RawRecord;
        if (!predicate(raw)) continue;
        examined += 1;
        const payload = Buffer.from(raw.rawPayload, 'base64');
        const preparedRaw = transform ? transform(raw, payload) : raw;
        const parsed = parser.parse(payload, {
          rawId: preparedRaw.rawId,
          tenantId: preparedRaw.tenantId,
          collectorId: preparedRaw.collectorId,
          deviceId: preparedRaw.deviceId,
          vendor: preparedRaw.vendor,
          exporterIp: preparedRaw.exporterIp,
          exporterPort: preparedRaw.exporterPort,
          transportIp: raw.exporterIp,
          receivedAt: preparedRaw.receivedAt
        });
        if (parsed.events.length === 0) continue;
        const updatedRaw: RawRecord = {
          ...preparedRaw,
          batchId: null,
          exporterTime: parsed.exporterTime,
          observationDomainId: parsed.observationDomainId,
          exportSequence: parsed.exportSequence,
          templateId: parsed.templateId,
          decodedJson: JSON.stringify(parsed.decoded),
          parseStatus: parsed.status,
          parserVersion: parsed.parserVersion,
          parseError: parsed.error
        };
        const events = parsed.events.map((event) => ({ ...event, batchId: null }));
        const result = update.run(JSON.stringify(updatedRaw), JSON.stringify(events), row.sequence);
        if (result.changes === 1) {
          requeuedRecords += 1;
          generatedEvents += events.length;
        }
      }
    })();

    return { examined, requeuedRecords, generatedEvents };
  }

  get(exporterIp: string, observationDomainId: number, templateId: number): NetflowTemplate | undefined {
    const row = this.db.prepare(`
      SELECT exporter_ip, observation_domain_id, template_id, fields_json, updated_at
      FROM netflow_templates
      WHERE exporter_ip = ? AND observation_domain_id = ? AND template_id = ?
    `).get(exporterIp, observationDomainId, templateId) as {
      exporter_ip: string;
      observation_domain_id: number;
      template_id: number;
      fields_json: string;
      updated_at: string;
    } | undefined;
    if (!row) return undefined;
    return {
      exporterIp: row.exporter_ip,
      observationDomainId: row.observation_domain_id,
      templateId: row.template_id,
      fields: JSON.parse(row.fields_json) as NetflowTemplate['fields'],
      updatedAt: row.updated_at
    };
  }

  put(template: NetflowTemplate): void {
    this.db.prepare(`
      INSERT INTO netflow_templates
        (exporter_ip, observation_domain_id, template_id, fields_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (exporter_ip, observation_domain_id, template_id)
      DO UPDATE SET fields_json = excluded.fields_json, updated_at = excluded.updated_at
    `).run(
      template.exporterIp,
      template.observationDomainId,
      template.templateId,
      JSON.stringify(template.fields),
      template.updatedAt
    );
  }

  private buildBatch(batch: BatchRow): IngestBatch {
    const rows = this.db.prepare(`
      SELECT sequence, raw_id, raw_json, events_json
      FROM raw_spool
      WHERE batch_id = ?
      ORDER BY sequence
    `).all(batch.batch_id) as SpoolRow[];
    const rawRecords = rows.map((row) => ({
      ...(JSON.parse(row.raw_json) as RawRecord),
      batchId: batch.batch_id
    }));
    const events = rows.flatMap((row) => (JSON.parse(row.events_json) as CgnatEvent[]).map((event) => ({
      ...event,
      batchId: batch.batch_id
    })));
    const first = rawRecords[0];
    if (!first) throw new Error(`Lote ${batch.batch_id} sem registros`);
    return ingestBatchSchema.parse({
      batchId: batch.batch_id,
      tenantId: first.tenantId,
      collectorId: first.collectorId,
      checksum: batch.checksum,
      createdAt: batch.created_at,
      rawRecords,
      events
    });
  }

  private identityKey(identity: SpoolIdentity): string {
    return `${identity.tenantId}\u0000${identity.collectorId}`;
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS raw_spool
      (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_id TEXT NOT NULL UNIQUE,
        raw_json TEXT NOT NULL,
        events_json TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('pending', 'batched', 'acked')),
        batch_id TEXT,
        created_at TEXT NOT NULL,
        acked_at TEXT,
        tenant_id TEXT,
        collector_id TEXT
      );

      CREATE TABLE IF NOT EXISTS sync_batches
      (
        batch_id TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'acked')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        last_attempt_at TEXT,
        acked_at TEXT,
        tenant_id TEXT,
        collector_id TEXT
      );

      CREATE TABLE IF NOT EXISTS sync_destinations
      (
        destination_id TEXT PRIMARY KEY,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_batch_deliveries
      (
        batch_id TEXT NOT NULL REFERENCES sync_batches(batch_id) ON DELETE CASCADE,
        destination_id TEXT NOT NULL REFERENCES sync_destinations(destination_id),
        status TEXT NOT NULL CHECK (status IN ('pending', 'acked')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NOT NULL DEFAULT '',
        last_attempt_at TEXT,
        acked_at TEXT,
        PRIMARY KEY (batch_id, destination_id)
      );

      CREATE TABLE IF NOT EXISTS netflow_templates
      (
        exporter_ip TEXT NOT NULL,
        observation_domain_id INTEGER NOT NULL,
        template_id INTEGER NOT NULL,
        fields_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (exporter_ip, observation_domain_id, template_id)
      );

      CREATE TABLE IF NOT EXISTS collector_state
      (
        exporter_ip TEXT NOT NULL,
        observation_domain_id INTEGER NOT NULL,
        last_export_sequence INTEGER,
        last_seen_at TEXT NOT NULL,
        PRIMARY KEY (exporter_ip, observation_domain_id)
      );

      CREATE TABLE IF NOT EXISTS device_registry
      (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        devices_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS raw_spool_state_sequence_idx ON raw_spool (state, sequence);
      CREATE INDEX IF NOT EXISTS raw_spool_batch_idx ON raw_spool (batch_id);
    `);
    const rawColumns = this.db.prepare('PRAGMA table_info(raw_spool)').all() as Array<{ name: string }>;
    if (!rawColumns.some((column) => column.name === 'tenant_id')) {
      this.db.exec('ALTER TABLE raw_spool ADD COLUMN tenant_id TEXT');
    }
    if (!rawColumns.some((column) => column.name === 'collector_id')) {
      this.db.exec('ALTER TABLE raw_spool ADD COLUMN collector_id TEXT');
    }
    const batchColumns = this.db.prepare('PRAGMA table_info(sync_batches)').all() as Array<{ name: string }>;
    if (!batchColumns.some((column) => column.name === 'tenant_id')) {
      this.db.exec('ALTER TABLE sync_batches ADD COLUMN tenant_id TEXT');
    }
    if (!batchColumns.some((column) => column.name === 'collector_id')) {
      this.db.exec('ALTER TABLE sync_batches ADD COLUMN collector_id TEXT');
    }
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS raw_spool_identity_state_sequence_idx
        ON raw_spool (tenant_id, collector_id, state, sequence)
        WHERE tenant_id IS NOT NULL AND collector_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS sync_batches_identity_status_created_idx
        ON sync_batches (tenant_id, collector_id, status, created_at)
        WHERE tenant_id IS NOT NULL AND collector_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS sync_batch_deliveries_pending_idx
        ON sync_batch_deliveries (destination_id, status, last_attempt_at, batch_id);
    `);
  }

  private ensureDestination(destinationId: string): void {
    const existing = this.db.prepare(`
      SELECT destination_id FROM sync_destinations WHERE destination_id = ? AND active = 1
    `).get(destinationId);
    if (existing) return;
    this.configureDestinations([
      ...this.db.prepare('SELECT destination_id FROM sync_destinations WHERE active = 1')
        .all().map((row) => (row as { destination_id: string }).destination_id),
      destinationId
    ]);
  }

  private acknowledgeBatchesWithoutPendingDestinations(acknowledgedAt: string, batchId?: string): void {
    const parameters = batchId ? [acknowledgedAt, batchId] : [acknowledgedAt];
    this.db.prepare(`
      UPDATE sync_batches AS batches
      SET status = 'acked', acked_at = ?, last_error = ''
      WHERE batches.status = 'pending'
        ${batchId ? 'AND batches.batch_id = ?' : ''}
        AND EXISTS (
          SELECT 1 FROM sync_batch_deliveries deliveries
          JOIN sync_destinations destinations ON destinations.destination_id = deliveries.destination_id
          WHERE deliveries.batch_id = batches.batch_id AND destinations.active = 1
        )
        AND NOT EXISTS (
          SELECT 1 FROM sync_batch_deliveries deliveries
          JOIN sync_destinations destinations ON destinations.destination_id = deliveries.destination_id
          WHERE deliveries.batch_id = batches.batch_id
            AND destinations.active = 1 AND deliveries.status = 'pending'
        )
    `).run(...parameters);
    this.db.prepare(`
      UPDATE raw_spool SET state = 'acked', acked_at = ?
      WHERE state = 'batched' AND batch_id IN (
        SELECT batch_id FROM sync_batches WHERE status = 'acked' ${batchId ? 'AND batch_id = ?' : ''}
      )
    `).run(...parameters);
  }
}
