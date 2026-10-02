import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { batchChecksum, sha256 } from '../core/crypto.js';
import {
  collectorHeartbeatSchema,
  appliedFirewallPolicySchema,
  firewallObservationSchema,
  ingestBatchGroupResponseSchema,
  ingestBatchGroupSchema,
  ingestBatchReceiptSchema,
  ingestBatchSchema,
  managedCloudCollectorConfigurationSchema,
  managedCloudCollectorTelemetrySchema,
  type IngestBatch,
  type IngestBatchGroupResponse,
  type IngestBatchReceipt
} from '../domain/models.js';
import type { BatchContents, ClickHouseRepository } from './clickhouse.js';
import type { BatchRegistration, PostgresRepository } from './postgres.js';

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice(7).trim();
  return token && token.length <= 4096 ? token : undefined;
}

const managedCloudHeartbeatSchema = collectorHeartbeatSchema
  .pick({ version: true, sentAt: true, hostMetrics: true })
  .extend({
    collectorTelemetry: z.array(managedCloudCollectorTelemetrySchema).max(1000).default([]),
    firewallObservations: z.array(firewallObservationSchema).max(10000).default([]),
    appliedFirewallPolicies: z.array(appliedFirewallPolicySchema).max(1000).default([])
  });

type IngestionDependencies = {
  postgres: PostgresRepository;
  clickhouse: ClickHouseRepository;
  managedCloudTokenHash: string;
  useSecondaryCloudPorts?: () => boolean;
};

function validateBatchContents(batch: IngestBatch): { error: string; [key: string]: unknown } | undefined {
  const rawById = new Map<string, (typeof batch.rawRecords)[number]>();
  for (const raw of batch.rawRecords) {
    if (
      raw.batchId !== batch.batchId
      || raw.tenantId !== batch.tenantId
      || raw.collectorId !== batch.collectorId
      || rawById.has(raw.rawId)
    ) {
      return { error: 'batch_identity_mismatch', rawId: raw.rawId };
    }
    rawById.set(raw.rawId, raw);
    const payload = Buffer.from(raw.rawPayload, 'base64');
    if (sha256(payload) !== raw.rawSha256) return { error: 'raw_checksum_mismatch', rawId: raw.rawId };
  }
  const eventIds = new Set<string>();
  for (const event of batch.events) {
    const raw = rawById.get(event.rawId);
    if (
      event.batchId !== batch.batchId
      || event.tenantId !== batch.tenantId
      || event.collectorId !== batch.collectorId
      || !raw
      || event.deviceId !== raw.deviceId
      || event.vendor !== raw.vendor
      || event.sourceType !== raw.sourceType
      || event.receivedAt !== raw.receivedAt
      || eventIds.has(event.eventId)
    ) {
      return { error: 'event_identity_mismatch', eventId: event.eventId };
    }
    eventIds.add(event.eventId);
  }
  return batchChecksum(batch.rawRecords, batch.events) === batch.checksum
    ? undefined
    : { error: 'batch_checksum_mismatch' };
}

function receiptMatches(batch: IngestBatch, receipt: {
  batchId: string; tenantId: string; collectorId: string; checksum: string; rawCount: number; eventCount: number;
}): boolean {
  return receipt.batchId === batch.batchId
    && receipt.tenantId === batch.tenantId
    && receipt.collectorId === batch.collectorId
    && receipt.checksum === batch.checksum
    && receipt.rawCount === batch.rawRecords.length
    && receipt.eventCount === batch.events.length;
}

function inspectExpectedContents(batch: IngestBatch, contents: BatchContents): {
  complete: boolean; divergent: boolean;
} {
  const expectedRawIds = new Set(batch.rawRecords.map((record) => record.rawId));
  const expectedEventIds = new Set(batch.events.map((event) => event.eventId));
  return {
    complete: contents.rawIds.size === expectedRawIds.size && contents.eventIds.size === expectedEventIds.size,
    divergent: [...contents.rawIds].some((id) => !expectedRawIds.has(id))
      || [...contents.eventIds].some((id) => !expectedEventIds.has(id))
  };
}

async function persistBatchGroup(
  batches: IngestBatch[],
  dependencies: Pick<IngestionDependencies, 'postgres' | 'clickhouse'>
): Promise<IngestBatchGroupResponse> {
  const batchIds = batches.map((batch) => batch.batchId);
  const registrations = await dependencies.postgres.registerBatches(batches);
  const [storedReceipts, before] = await Promise.all([
    dependencies.clickhouse.getBatchReceipts(batchIds),
    dependencies.clickhouse.inspectBatches(batchIds)
  ]);
  const failures: IngestBatchGroupResponse['failures'] = [];
  const newCandidates: IngestBatch[] = [];
  const repairCandidates: IngestBatch[] = [];
  const repaired = new Set<string>();

  for (const batch of batches) {
    const receipt = storedReceipts.get(batch.batchId);
    const contents = before.get(batch.batchId) ?? { rawIds: new Set(), eventIds: new Set() };
    if (receipt && !receiptMatches(batch, receipt)) {
      failures.push({ batchId: batch.batchId, error: 'receipt_mismatch' });
      continue;
    }
    const inspection = inspectExpectedContents(batch, contents);
    if (inspection.divergent) {
      failures.push({ batchId: batch.batchId, error: 'stored_content_mismatch' });
      continue;
    }
    if (!inspection.complete) {
      const registration = registrations.get(batch.batchId);
      if (!registration) throw new Error(`Registro PostgreSQL ausente para o lote ${batch.batchId}`);
      if (receipt || registration.status !== 'new' || contents.rawIds.size > 0 || contents.eventIds.size > 0) {
        repaired.add(batch.batchId);
        repairCandidates.push(batch);
      } else {
        newCandidates.push(batch);
      }
    }
  }

  if (newCandidates.length) await dependencies.clickhouse.insertBatchGroup(newCandidates, before, false);
  if (repairCandidates.length) await dependencies.clickhouse.insertBatchGroup(repairCandidates, before, true);

  const eligible = batches.filter((batch) => !failures.some((failure) => failure.batchId === batch.batchId));
  const confirmed = await dependencies.clickhouse.inspectBatches(eligible.map((batch) => batch.batchId));
  const committed: IngestBatch[] = [];
  for (const batch of eligible) {
    const inspection = inspectExpectedContents(
      batch,
      confirmed.get(batch.batchId) ?? { rawIds: new Set(), eventIds: new Set() }
    );
    if (!inspection.complete || inspection.divergent) {
      failures.push({ batchId: batch.batchId, error: 'batch_not_committed' });
    } else {
      committed.push(batch);
    }
  }

  await dependencies.clickhouse.recordBatchReceipts(committed);
  await dependencies.postgres.markBatchesCommitted(committed.map((batch) => batch.batchId));
  const receipts: IngestBatchReceipt[] = committed.map((batch) => {
    const registration = registrations.get(batch.batchId) as BatchRegistration;
    return ingestBatchReceiptSchema.parse({
      batchId: batch.batchId,
      status: 'committed',
      checksum: batch.checksum,
      rawCount: batch.rawRecords.length,
      eventCount: batch.events.length,
      duplicate: registration.status !== 'new',
      repaired: repaired.has(batch.batchId)
    });
  });
  return ingestBatchGroupResponseSchema.parse({ receipts, failures });
}

export function registerIngestionRoutes(
  app: FastifyInstance,
  dependencies: {
    postgres: PostgresRepository;
    clickhouse: ClickHouseRepository;
    managedCloudTokenHash: string;
    useSecondaryCloudPorts?: () => boolean;
  }
): void {
  app.post('/v1/ingest/managed-cloud/registry', async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (!token || sha256(token) !== dependencies.managedCloudTokenHash) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const parsed = managedCloudHeartbeatSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_managed_cloud_heartbeat' });
    await dependencies.postgres.touchManagedCloudCollectors({
      version: parsed.data.version,
      sampledAt: parsed.data.sentAt,
      collectorTelemetry: parsed.data.collectorTelemetry,
      firewallObservations: parsed.data.firewallObservations,
      appliedFirewallPolicies: parsed.data.appliedFirewallPolicies,
      ...(parsed.data.hostMetrics ? { hostMetrics: parsed.data.hostMetrics } : {})
    });
    const collectors = await dependencies.postgres.listManagedCloudCollectorConfiguration(
      dependencies.useSecondaryCloudPorts?.() ?? false
    );
    const validated = managedCloudCollectorConfigurationSchema.array().max(1000).parse(collectors);
    return reply.send({ status: 'recorded', receivedAt: new Date().toISOString(), collectors: validated });
  });

  app.post('/v1/ingest/heartbeat', async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    const identity = token
      ? await dependencies.postgres.findCollectorIdentityByTokenHash(sha256(token))
      : undefined;
    if (!identity) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = collectorHeartbeatSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_heartbeat', details: parsed.error.flatten() });
    if (parsed.data.tenantId !== identity.tenantId || parsed.data.collectorId !== identity.id) {
      return reply.code(403).send({ error: 'collector_identity_mismatch' });
    }
    const recorded = await dependencies.postgres.recordCollectorHeartbeat(parsed.data);
    if (!recorded) return reply.code(404).send({ error: 'collector_not_found' });
    const receivedAt = new Date().toISOString();
    if (parsed.data.hostMetrics) {
      try {
        await dependencies.clickhouse.insertServerMetric({
          tenantId: parsed.data.tenantId,
          serverId: `collector:${parsed.data.collectorId}`,
          sampledAt: receivedAt,
          metrics: parsed.data.hostMetrics
        });
      } catch (error) {
        request.log.warn({ error, collectorId: parsed.data.collectorId }, 'Falha ao registrar histórico de recursos');
      }
    }
    const devices = await dependencies.postgres.listCollectorDeviceConfiguration(
      parsed.data.tenantId,
      parsed.data.collectorId
    );
    return reply.send({ status: 'recorded', receivedAt, devices });
  });

  const authorizeBatches = async (authorization: string | undefined, batches: IngestBatch[]): Promise<{
    authorized: boolean; authenticated: boolean;
  }> => {
    const token = bearerToken(authorization);
    const tokenHash = token ? sha256(token) : undefined;
    const managedCloudToken = tokenHash === dependencies.managedCloudTokenHash;
    const identity = token
      ? await dependencies.postgres.findCollectorIdentityByTokenHash(tokenHash ?? '')
      : undefined;
    if (!identity && !managedCloudToken) return { authorized: false, authenticated: false };
    const first = batches[0];
    if (!first) return { authorized: false, authenticated: true };
    if (identity && first.tenantId === identity.tenantId && first.collectorId === identity.id) {
      return { authorized: true, authenticated: true };
    }
    const managedCloudAllowed = managedCloudToken
      && await dependencies.postgres.isActiveManagedCloudCollector(first.tenantId, first.collectorId);
    return { authorized: Boolean(managedCloudAllowed), authenticated: true };
  };

  app.post('/v1/ingest/batches', { bodyLimit: 64 * 1024 * 1024 }, async (request, reply) => {
    const parsed = ingestBatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_batch', details: parsed.error.flatten() });
    const batch = parsed.data;
    const authorization = await authorizeBatches(request.headers.authorization, [batch]);
    if (!authorization.authenticated) return reply.code(401).send({ error: 'unauthorized' });
    if (!authorization.authorized) return reply.code(403).send({ error: 'collector_identity_mismatch' });
    const invalid = validateBatchContents(batch);
    if (invalid) return reply.code(400).send(invalid);
    try {
      const result = await persistBatchGroup([batch], dependencies);
      const receipt = result.receipts[0];
      if (!receipt || result.failures.length) {
        return reply.code(503).send({ error: result.failures[0]?.error ?? 'batch_not_committed', batchId: batch.batchId });
      }
      return reply.send(receipt);
    } catch (error) {
      request.log.error({ error, batchId: batch.batchId }, 'Falha ao persistir lote');
      return reply.code(503).send({ error: 'batch_not_committed', batchId: batch.batchId });
    }
  });

  app.post('/v1/ingest/batches/bulk', { bodyLimit: 64 * 1024 * 1024 }, async (request, reply) => {
    const parsed = ingestBatchGroupSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_batch_group', details: parsed.error.flatten() });
    const batches = parsed.data.batches;
    const authorization = await authorizeBatches(request.headers.authorization, batches);
    if (!authorization.authenticated) return reply.code(401).send({ error: 'unauthorized' });
    if (!authorization.authorized) return reply.code(403).send({ error: 'collector_identity_mismatch' });
    for (const batch of batches) {
      const invalid = validateBatchContents(batch);
      if (invalid) return reply.code(400).send({ ...invalid, batchId: batch.batchId });
    }
    try {
      return reply.send(await persistBatchGroup(batches, dependencies));
    } catch (error) {
      request.log.error({ error, batchIds: batches.map((batch) => batch.batchId) }, 'Falha ao persistir grupo de lotes');
      return reply.code(503).send({ error: 'batch_group_not_committed' });
    }
  });
}
