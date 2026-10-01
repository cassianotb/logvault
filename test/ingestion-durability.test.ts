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

async function request(input: {
  registration: 'new' | 'received' | 'committed';
  clickhouse: Partial<ClickHouseRepository>;
}) {
  const markBatchCommitted = vi.fn(async () => undefined);
  const postgres = {
    findCollectorIdentityByTokenHash: async () => ({ id: collectorId, tenantId }),
    registerBatch: async () => ({ status: input.registration }),
    markBatchCommitted
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
  return { response, markBatchCommitted };
}

describe('confirmação durável da ingestão', () => {
  it('só confirma um lote novo depois dos dados e do comprovante ClickHouse', async () => {
    const insertBatch = vi.fn(async () => undefined);
    const countBatch = vi.fn(async () => ({ rawCount: 1, eventCount: 1 }));
    const recordBatchReceipt = vi.fn(async () => undefined);
    const result = await request({
      registration: 'new',
      clickhouse: { getBatchReceipt: async () => undefined, insertBatch, countBatch, recordBatchReceipt }
    });

    expect(result.response.statusCode, result.response.body).toBe(200);
    expect(result.response.json()).toMatchObject({
      batchId, status: 'committed', checksum: batch().checksum,
      rawCount: 1, eventCount: 1, duplicate: false, repaired: false
    });
    expect(insertBatch).toHaveBeenCalledOnce();
    expect(countBatch).toHaveBeenCalledOnce();
    expect(recordBatchReceipt).toHaveBeenCalledOnce();
    expect(result.markBatchCommitted).toHaveBeenCalledOnce();
  });

  it('revalida no ClickHouse até mesmo um lote que já possui comprovante', async () => {
    const value = batch();
    const inspectBatch = vi.fn(async () => ({
      rawIds: new Set([rawId]), eventIds: new Set([eventId])
    }));
    const insertBatch = vi.fn();
    const result = await request({
      registration: 'committed',
      clickhouse: {
        getBatchReceipt: async () => ({
          batchId, tenantId, collectorId, checksum: value.checksum, rawCount: 1, eventCount: 1
        }),
        inspectBatch, insertBatch
      }
    });

    expect(result.response.statusCode).toBe(200);
    expect(result.response.json()).toMatchObject({ duplicate: true, repaired: false });
    expect(inspectBatch).toHaveBeenCalledOnce();
    expect(insertBatch).not.toHaveBeenCalled();
    expect(result.markBatchCommitted).toHaveBeenCalledOnce();
  });

  it('repara linhas perdidas após desligamento mesmo quando o comprovante sobreviveu', async () => {
    const value = batch();
    const missing = { rawIds: new Set([rawId]), eventIds: new Set<string>() };
    const complete = { rawIds: new Set([rawId]), eventIds: new Set([eventId]) };
    const inspectBatch = vi.fn()
      .mockResolvedValueOnce(missing)
      .mockResolvedValueOnce(complete);
    const insertBatch = vi.fn(async () => undefined);
    const recordBatchReceipt = vi.fn(async () => undefined);
    const result = await request({
      registration: 'committed',
      clickhouse: {
        getBatchReceipt: async () => ({
          batchId, tenantId, collectorId, checksum: value.checksum, rawCount: 1, eventCount: 1
        }),
        inspectBatch, insertBatch, recordBatchReceipt
      }
    });

    expect(result.response.statusCode, result.response.body).toBe(200);
    expect(result.response.json()).toMatchObject({ duplicate: true, repaired: true });
    expect(insertBatch).toHaveBeenCalledWith(expect.objectContaining({ batchId }), missing, true);
    expect(recordBatchReceipt).toHaveBeenCalledOnce();
    expect(result.markBatchCommitted).toHaveBeenCalledOnce();
  });

  it('repara somente os membros ausentes de um lote anteriormente confirmado', async () => {
    const partial = { rawIds: new Set([rawId]), eventIds: new Set<string>() };
    const complete = { rawIds: new Set([rawId]), eventIds: new Set([eventId]) };
    const inspectBatch = vi.fn()
      .mockResolvedValueOnce(partial)
      .mockResolvedValueOnce(complete);
    const insertBatch = vi.fn(async () => undefined);
    const recordBatchReceipt = vi.fn(async () => undefined);
    const result = await request({
      registration: 'committed',
      clickhouse: { getBatchReceipt: async () => undefined, inspectBatch, insertBatch, recordBatchReceipt }
    });

    expect(result.response.statusCode).toBe(200);
    expect(result.response.json()).toMatchObject({ duplicate: true, repaired: true });
    expect(insertBatch).toHaveBeenCalledWith(expect.objectContaining({ batchId }), partial, true);
    expect(recordBatchReceipt).toHaveBeenCalledOnce();
    expect(result.markBatchCommitted).toHaveBeenCalledOnce();
  });

  it('não confirma quando a verificação posterior à escrita continua incompleta', async () => {
    const result = await request({
      registration: 'new',
      clickhouse: {
        getBatchReceipt: async () => undefined,
        insertBatch: async () => undefined,
        countBatch: async () => ({ rawCount: 1, eventCount: 0 }),
        recordBatchReceipt: vi.fn()
      }
    });

    expect(result.response.statusCode).toBe(503);
    expect(result.response.json()).toMatchObject({ error: 'batch_not_committed', batchId });
    expect(result.markBatchCommitted).not.toHaveBeenCalled();
  });

  it('não aceita conteúdo inesperado associado ao mesmo batchId', async () => {
    const insertBatch = vi.fn();
    const result = await request({
      registration: 'received',
      clickhouse: {
        getBatchReceipt: async () => undefined,
        inspectBatch: async () => ({
          rawIds: new Set([rawId, '60000000-0000-4000-8000-000000000099']),
          eventIds: new Set([eventId])
        }),
        insertBatch
      }
    });

    expect(result.response.statusCode).toBe(503);
    expect(insertBatch).not.toHaveBeenCalled();
    expect(result.markBatchCommitted).not.toHaveBeenCalled();
  });
});
