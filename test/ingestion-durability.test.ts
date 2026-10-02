import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { batchChecksum, sha256 } from '../src/core/crypto.js';
import type { CgnatEvent, IngestBatch, RawRecord } from '../src/domain/models.js';
import { registerIngestionRoutes } from '../src/api/ingestion.js';
import type { ClickHouseRepository } from '../src/api/clickhouse.js';
import type { PostgresRepository } from '../src/api/postgres.js';

const token = 'collector-token';
const tenantId = '60000000-0000-4000-8000-000000000001';
const collectorId = '60000000-0000-4000-8000-000000000002';
const deviceId = '60000000-0000-4000-8000-000000000003';
const batchId = '60000000-0000-4000-8000-000000000004';
const rawId = '60000000-0000-4000-8000-000000000005';
const eventId = '60000000-0000-4000-8000-000000000006';

function batch(): IngestBatch {
  const payload = Buffer.from('durable batch');
  const raw: RawRecord = {
    rawId, batchId, tenantId, collectorId, deviceId,
    vendor: 'cisco', sourceType: 'netflow_v9', exporterIp: '192.0.2.1', exporterPort: 2055,
    localSequence: 1, receivedAt: '2026-10-01T12:00:00.000Z', exporterTime: null,
    observationDomainId: 1, exportSequence: 10, templateId: 256,
    payloadFormat: 'base64', rawPayload: payload.toString('base64'), rawSha256: sha256(payload),
    decodedJson: '{}', parseStatus: 'parsed', parserVersion: 'test/1', parseError: ''
  };
  const event: CgnatEvent = {
    eventId, rawId, batchId, recordIndex: 0, tenantId, collectorId, deviceId,
    vendor: 'cisco', sourceType: 'netflow_v9', eventAt: raw.receivedAt, receivedAt: raw.receivedAt,
    publicIp: '198.51.100.1', privateIp: '100.64.0.1', protocol: 6, protocolName: 'tcp',
    portStart: 1000, portEnd: 1999, portMode: 'contiguous', portStep: null, portCount: 1000,
    eventType: 'allocated', eventTypeRaw: '1', vendorFields: {}, parserVersion: 'test/1'
  };
  return {
    batchId, tenantId, collectorId, createdAt: '2026-10-01T12:00:01.000Z',
    rawRecords: [raw], events: [event], checksum: batchChecksum([raw], [event])
  };
}

function additionalBatch(): IngestBatch {
  const original = batch();
  const nextBatchId = '61000000-0000-4000-8000-000000000004';
  const nextRawId = '61000000-0000-4000-8000-000000000005';
  const nextEventId = '61000000-0000-4000-8000-000000000006';
  const raw = { ...original.rawRecords[0]!, batchId: nextBatchId, rawId: nextRawId, localSequence: 2 };
  const event = {
    ...original.events[0]!, batchId: nextBatchId, rawId: nextRawId,
    eventId: nextEventId, recordIndex: 0
  };
  return {
    ...original, batchId: nextBatchId, rawRecords: [raw], events: [event],
    checksum: batchChecksum([raw], [event])
  };
}

async function request(input: {
  registration: 'new' | 'received' | 'committed';
  clickhouse: Partial<ClickHouseRepository>;
}) {
  const markBatchesCommitted = vi.fn(async () => undefined);
  const postgres = {
    findCollectorIdentityByTokenHash: async () => ({ id: collectorId, tenantId }),
    registerBatches: async (batches: IngestBatch[]) => new Map(
      batches.map((value) => [value.batchId, { status: input.registration }])
    ),
    markBatchesCommitted
  } as unknown as PostgresRepository;
  const app = Fastify();
  registerIngestionRoutes(app, {
    postgres,
    clickhouse: input.clickhouse as ClickHouseRepository,
    managedCloudTokenHash: sha256('managed-cloud')
  });
  const response = await app.inject({
    method: 'POST', url: '/v1/ingest/batches',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    payload: JSON.stringify(batch())
  });
  await app.close();
  return { response, markBatchesCommitted };
}

function contents(rawIds: string[] = [], eventIds: string[] = []) {
  return new Map([[batchId, { rawIds: new Set(rawIds), eventIds: new Set(eventIds) }]]);
}

describe('confirmação durável da ingestão', () => {
  it('persiste vários lotes numa operação e devolve um comprovante individual para cada um', async () => {
    const batches = [batch(), additionalBatch()];
    let inspection = 0;
    const insertBatchGroup = vi.fn(async () => undefined);
    const markBatchesCommitted = vi.fn(async () => undefined);
    const postgres = {
      findCollectorIdentityByTokenHash: async () => ({ id: collectorId, tenantId }),
      registerBatches: async (values: IngestBatch[]) => new Map(
        values.map((value) => [value.batchId, { status: 'new' as const }])
      ),
      markBatchesCommitted
    } as unknown as PostgresRepository;
    const clickhouse = {
      getBatchReceipts: async () => new Map(),
      inspectBatches: async (ids: string[]) => {
        inspection += 1;
        return new Map(ids.map((id) => {
          const value = batches.find((candidate) => candidate.batchId === id)!;
          return [id, inspection === 1
            ? { rawIds: new Set<string>(), eventIds: new Set<string>() }
            : {
                rawIds: new Set(value.rawRecords.map((record) => record.rawId)),
                eventIds: new Set(value.events.map((event) => event.eventId))
              }];
        }));
      },
      insertBatchGroup,
      recordBatchReceipts: async () => undefined
    } as unknown as ClickHouseRepository;
    const app = Fastify();
    registerIngestionRoutes(app, { postgres, clickhouse, managedCloudTokenHash: sha256('managed-cloud') });

    const response = await app.inject({
      method: 'POST', url: '/v1/ingest/batches/bulk',
      headers: { authorization: `Bearer ${token}` }, payload: { batches }
    });
    await app.close();

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      receipts: batches.map((value) => ({ batchId: value.batchId, status: 'committed' })), failures: []
    });
    expect(insertBatchGroup).toHaveBeenCalledOnce();
    expect(insertBatchGroup.mock.calls[0]?.[0]).toHaveLength(2);
    expect(markBatchesCommitted).toHaveBeenCalledWith(batches.map((value) => value.batchId));
  });

  it('só confirma um lote novo depois dos dados e do comprovante ClickHouse', async () => {
    const insertBatchGroup = vi.fn(async () => undefined);
    const inspectBatches = vi.fn()
      .mockResolvedValueOnce(contents())
      .mockResolvedValueOnce(contents([rawId], [eventId]));
    const recordBatchReceipts = vi.fn(async () => undefined);
    const result = await request({
      registration: 'new',
      clickhouse: {
        getBatchReceipts: async () => new Map(), inspectBatches,
        insertBatchGroup, recordBatchReceipts
      }
    });

    expect(result.response.statusCode, result.response.body).toBe(200);
    expect(result.response.json()).toMatchObject({
      batchId, status: 'committed', checksum: batch().checksum,
      rawCount: 1, eventCount: 1, duplicate: false, repaired: false
    });
    expect(insertBatchGroup).toHaveBeenCalledOnce();
    expect(inspectBatches).toHaveBeenCalledTimes(2);
    expect(recordBatchReceipts).toHaveBeenCalledOnce();
    expect(result.markBatchesCommitted).toHaveBeenCalledWith([batchId]);
  });

  it('revalida no ClickHouse até mesmo um lote que já possui comprovante', async () => {
    const value = batch();
    const inspectBatches = vi.fn(async () => contents([rawId], [eventId]));
    const insertBatchGroup = vi.fn();
    const result = await request({
      registration: 'committed',
      clickhouse: {
        getBatchReceipts: async () => new Map([[batchId, {
          batchId, tenantId, collectorId, checksum: value.checksum, rawCount: 1, eventCount: 1
        }]]),
        inspectBatches, insertBatchGroup, recordBatchReceipts: async () => undefined
      }
    });

    expect(result.response.statusCode).toBe(200);
    expect(result.response.json()).toMatchObject({ duplicate: true, repaired: false });
    expect(inspectBatches).toHaveBeenCalledTimes(2);
    expect(insertBatchGroup).not.toHaveBeenCalled();
    expect(result.markBatchesCommitted).toHaveBeenCalledWith([batchId]);
  });

  it('repara linhas perdidas após desligamento mesmo quando o comprovante sobreviveu', async () => {
    const value = batch();
    const missing = contents([rawId]);
    const complete = contents([rawId], [eventId]);
    const inspectBatches = vi.fn().mockResolvedValueOnce(missing).mockResolvedValueOnce(complete);
    const insertBatchGroup = vi.fn(async () => undefined);
    const recordBatchReceipts = vi.fn(async () => undefined);
    const result = await request({
      registration: 'committed',
      clickhouse: {
        getBatchReceipts: async () => new Map([[batchId, {
          batchId, tenantId, collectorId, checksum: value.checksum, rawCount: 1, eventCount: 1
        }]]),
        inspectBatches, insertBatchGroup, recordBatchReceipts
      }
    });

    expect(result.response.statusCode, result.response.body).toBe(200);
    expect(result.response.json()).toMatchObject({ duplicate: true, repaired: true });
    expect(insertBatchGroup).toHaveBeenCalledWith(
      [expect.objectContaining({ batchId })], missing, true
    );
    expect(recordBatchReceipts).toHaveBeenCalledOnce();
    expect(result.markBatchesCommitted).toHaveBeenCalledWith([batchId]);
  });

  it('repara somente os membros ausentes de um lote anteriormente confirmado', async () => {
    const partial = contents([rawId]);
    const complete = contents([rawId], [eventId]);
    const inspectBatches = vi.fn()
      .mockResolvedValueOnce(partial)
      .mockResolvedValueOnce(complete);
    const insertBatchGroup = vi.fn(async () => undefined);
    const recordBatchReceipts = vi.fn(async () => undefined);
    const result = await request({
      registration: 'committed',
      clickhouse: {
        getBatchReceipts: async () => new Map(), inspectBatches,
        insertBatchGroup, recordBatchReceipts
      }
    });

    expect(result.response.statusCode).toBe(200);
    expect(result.response.json()).toMatchObject({ duplicate: true, repaired: true });
    expect(insertBatchGroup).toHaveBeenCalledWith(
      [expect.objectContaining({ batchId })], partial, true
    );
    expect(recordBatchReceipts).toHaveBeenCalledOnce();
    expect(result.markBatchesCommitted).toHaveBeenCalledWith([batchId]);
  });

  it('não confirma quando a verificação posterior à escrita continua incompleta', async () => {
    const result = await request({
      registration: 'new',
      clickhouse: {
        getBatchReceipts: async () => new Map(),
        insertBatchGroup: async () => undefined,
        inspectBatches: async () => contents([rawId]),
        recordBatchReceipts: vi.fn()
      }
    });

    expect(result.response.statusCode).toBe(503);
    expect(result.response.json()).toMatchObject({ error: 'batch_not_committed', batchId });
    expect(result.markBatchesCommitted).toHaveBeenCalledWith([]);
  });

  it('não aceita conteúdo inesperado associado ao mesmo batchId', async () => {
    const insertBatchGroup = vi.fn();
    const result = await request({
      registration: 'received',
      clickhouse: {
        getBatchReceipts: async () => new Map(),
        inspectBatches: async () => contents(
          [rawId, '60000000-0000-4000-8000-000000000099'], [eventId]
        ),
        insertBatchGroup,
        recordBatchReceipts: vi.fn()
      }
    });

    expect(result.response.statusCode).toBe(503);
    expect(insertBatchGroup).not.toHaveBeenCalled();
    expect(result.markBatchesCommitted).toHaveBeenCalledWith([]);
  });
});
