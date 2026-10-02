import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { createClient } from '@clickhouse/client';
import { ClickHouseRepository } from '../src/api/clickhouse.js';
import { registerIngestionRoutes } from '../src/api/ingestion.js';
import type { PostgresRepository } from '../src/api/postgres.js';
import { batchChecksum, sha256 } from '../src/core/crypto.js';
import type { CgnatEvent, IngestBatch, RawRecord } from '../src/domain/models.js';

const enabled = process.env.ARGUS_INTEGRATION_CLICKHOUSE === 'true';
const tenantId = '70000000-0000-4000-8000-000000000001';
const collectorId = '70000000-0000-4000-8000-000000000002';
const deviceId = '70000000-0000-4000-8000-000000000003';
const batchId = '70000000-0000-4000-8000-000000000004';

function fixture(): IngestBatch {
  const rawRecords: RawRecord[] = [0, 1].map((index) => {
    const payload = Buffer.from(`integration-${index}`);
    return {
      rawId: `70000000-0000-4000-8000-00000000001${index}`,
      batchId, tenantId, collectorId, deviceId, vendor: 'cisco', sourceType: 'netflow_v9',
      exporterIp: '192.0.2.70', exporterPort: 2055, localSequence: index + 1,
      receivedAt: `2026-10-01T13:00:0${index}.000Z`, exporterTime: null,
      observationDomainId: 70, exportSequence: index, templateId: 256,
      payloadFormat: 'base64', rawPayload: payload.toString('base64'), rawSha256: sha256(payload),
      decodedJson: '{}', parseStatus: 'parsed', parserVersion: 'integration/1', parseError: ''
    };
  });
  const events: CgnatEvent[] = rawRecords.map((raw, index) => ({
    eventId: `70000000-0000-4000-8000-00000000002${index}`,
    rawId: raw.rawId, batchId, recordIndex: 0, tenantId, collectorId, deviceId,
    vendor: 'cisco', sourceType: 'netflow_v9', eventAt: raw.receivedAt, receivedAt: raw.receivedAt,
    publicIp: '198.51.100.70', privateIp: `100.64.0.${index + 1}`,
    protocol: 6, protocolName: 'tcp', portStart: 1000 + index, portEnd: 1000 + index,
    portMode: 'contiguous', portStep: null, portCount: 1,
    eventType: 'allocated', eventTypeRaw: '1', vendorFields: {}, parserVersion: 'integration/1'
  }));
  return {
    batchId, tenantId, collectorId, createdAt: '2026-10-01T13:00:02.000Z',
    rawRecords, events, checksum: batchChecksum(rawRecords, events)
  };
}

function bulkFixtures(count: number): IngestBatch[] {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index + 1).padStart(12, '0');
    const currentBatchId = `72000000-0000-4000-8000-${suffix}`;
    const currentRawId = `72100000-0000-4000-8000-${suffix}`;
    const currentEventId = `72200000-0000-4000-8000-${suffix}`;
    const payload = Buffer.from(`bulk-integration-${index}`);
    const receivedAt = new Date(Date.parse('2026-10-01T14:00:00.000Z') + index).toISOString();
    const raw: RawRecord = {
      rawId: currentRawId, batchId: currentBatchId, tenantId, collectorId, deviceId,
      vendor: 'cisco', sourceType: 'netflow_v9', exporterIp: '192.0.2.70', exporterPort: 2055,
      localSequence: index + 1, receivedAt, exporterTime: null, observationDomainId: 70,
      exportSequence: index, templateId: 256, payloadFormat: 'base64',
      rawPayload: payload.toString('base64'), rawSha256: sha256(payload), decodedJson: '{}',
      parseStatus: 'parsed', parserVersion: 'integration/1', parseError: ''
    };
    const event: CgnatEvent = {
      eventId: currentEventId, rawId: currentRawId, batchId: currentBatchId, recordIndex: 0,
      tenantId, collectorId, deviceId, vendor: 'cisco', sourceType: 'netflow_v9',
      eventAt: receivedAt, receivedAt, publicIp: '198.51.100.70', privateIp: '100.64.0.1',
      protocol: 6, protocolName: 'tcp', portStart: 1000, portEnd: 1000,
      portMode: 'contiguous', portStep: null, portCount: 1, eventType: 'allocated',
      eventTypeRaw: '1', vendorFields: {}, parserVersion: 'integration/1'
    };
    return {
      batchId: currentBatchId, tenantId, collectorId, createdAt: receivedAt,
      rawRecords: [raw], events: [event], checksum: batchChecksum([raw], [event])
    };
  });
}

describe.skipIf(!enabled)('persistência ClickHouse real', () => {
  const connection = {
    url: process.env.ARGUS_CLICKHOUSE_URL ?? 'http://127.0.0.1:8123',
    username: process.env.ARGUS_CLICKHOUSE_USER ?? 'argus',
    password: process.env.ARGUS_CLICKHOUSE_PASSWORD ?? 'change-me',
    database: 'argus'
  };
  const repository = new ClickHouseRepository(connection);
  const client = createClient(connection);

  beforeAll(async () => { await repository.deleteTenantData(tenantId); });
  afterAll(async () => {
    await repository.deleteTenantData(tenantId);
    await repository.close();
    await client.close();
  });

  it('completa uma escrita parcial pela API, grava o comprovante e usa o caminho rápido no reenvio', async () => {
    const full = fixture();
    await repository.insertBatch({
      ...full, rawRecords: [full.rawRecords[0]!], events: [full.events[0]!]
    });
    const partial = await repository.inspectBatch(batchId);
    expect(partial.rawIds.size).toBe(1);
    expect(partial.eventIds.size).toBe(1);

    const postgres = {
      findCollectorIdentityByTokenHash: async () => ({ id: collectorId, tenantId }),
      registerBatches: async (batches: IngestBatch[]) => new Map(
        batches.map((batch) => [batch.batchId, { status: 'committed' as const }])
      ),
      markBatchesCommitted: async () => undefined
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerIngestionRoutes(app, {
      postgres, clickhouse: repository, managedCloudTokenHash: sha256('managed-cloud')
    });
    const first = await app.inject({
      method: 'POST', url: '/v1/ingest/batches',
      headers: { authorization: 'Bearer integration-token' }, payload: full
    });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({ batchId, duplicate: true, repaired: true });

    const complete = await repository.inspectBatch(batchId);
    expect([...complete.rawIds].sort()).toEqual(full.rawRecords.map((row) => row.rawId).sort());
    expect([...complete.eventIds].sort()).toEqual(full.events.map((event) => event.eventId).sort());

    const second = await app.inject({
      method: 'POST', url: '/v1/ingest/batches',
      headers: { authorization: 'Bearer integration-token' }, payload: full
    });
    expect(second.statusCode, second.body).toBe(200);
    expect(second.json()).toMatchObject({ batchId, duplicate: true, repaired: false });

    expect(await repository.getBatchReceipt(batchId)).toMatchObject({
      batchId, tenantId, collectorId, checksum: full.checksum, rawCount: 2, eventCount: 2
    });
    expect(await repository.countBatch(batchId)).toEqual({ rawCount: 2, eventCount: 2 });

    // Simula o caso observado em campo: a VM foi desligada depois do ACK,
    // uma linha sumiu, mas o comprovante do lote permaneceu.
    await client.command({
      query: 'ALTER TABLE cgnat_events DELETE WHERE event_id = {eventId:UUID}',
      query_params: { eventId: full.events[1]!.eventId },
      clickhouse_settings: { mutations_sync: 2 }
    });
    expect(await repository.countBatch(batchId)).toEqual({ rawCount: 2, eventCount: 1 });

    const recovered = await app.inject({
      method: 'POST', url: '/v1/ingest/batches',
      headers: { authorization: 'Bearer integration-token' }, payload: full
    });
    expect(recovered.statusCode, recovered.body).toBe(200);
    expect(recovered.json()).toMatchObject({ batchId, duplicate: true, repaired: true });
    expect(await repository.countBatch(batchId)).toEqual({ rawCount: 2, eventCount: 2 });
    await app.close();
  });

  it('persiste 100 lotes numa requisição com comprovantes e conteúdos individuais', async () => {
    const batches = bulkFixtures(100);
    let committed: string[] = [];
    const postgres = {
      findCollectorIdentityByTokenHash: async () => ({ id: collectorId, tenantId }),
      registerBatches: async (values: IngestBatch[]) => new Map(
        values.map((batch) => [batch.batchId, { status: 'new' as const }])
      ),
      markBatchesCommitted: async (ids: string[]) => { committed = ids; }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerIngestionRoutes(app, {
      postgres, clickhouse: repository, managedCloudTokenHash: sha256('managed-cloud')
    });

    const response = await app.inject({
      method: 'POST', url: '/v1/ingest/batches/bulk',
      headers: { authorization: 'Bearer integration-token' }, payload: { batches }
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ failures: [] });
    expect(response.json().receipts).toHaveLength(100);
    expect(committed).toEqual(batches.map((batch) => batch.batchId));
    expect((await repository.getBatchReceipts(committed)).size).toBe(100);
    const contents = await repository.inspectBatches(committed);
    expect([...contents.values()].every((value) => value.rawIds.size === 1 && value.eventIds.size === 1)).toBe(true);
    await app.close();
  });
});
