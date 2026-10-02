import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { batchChecksum, sha256 } from '../src/core/crypto.js';
import type { IngestBatch, RawRecord } from '../src/domain/models.js';
import { registerIngestionRoutes } from '../src/api/ingestion.js';
import type { ClickHouseRepository } from '../src/api/clickhouse.js';
import type { PostgresRepository } from '../src/api/postgres.js';

const token = 'managed-cloud-token';

describe('ingestão do Cloud gerenciado', () => {
  it('entrega somente o registro Cloud ao processo central autenticado', async () => {
    let reportedTelemetry: unknown;
    const postgres = {
      touchManagedCloudCollectors: async (input: unknown) => { reportedTelemetry = input; },
      listManagedCloudCollectorConfiguration: async () => [{
        tenantId: '20000000-0000-4000-8000-000000000001',
        collectorId: '30000000-0000-4000-8000-000000000001',
        name: 'Cloud ISP', netflowPort: 30000, syslogPort: 30001, devices: []
      }]
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerIngestionRoutes(app, {
      postgres, clickhouse: {} as ClickHouseRepository, managedCloudTokenHash: sha256(token)
    });
    const denied = await app.inject({ method: 'POST', url: '/v1/ingest/managed-cloud/registry', payload: {} });
    expect(denied.statusCode).toBe(401);
    const response = await app.inject({
      method: 'POST', url: '/v1/ingest/managed-cloud/registry',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: '0.1.0',
        sentAt: '2026-08-12T12:00:00.000Z',
        collectorTelemetry: [{
          tenantId: '20000000-0000-4000-8000-000000000001',
          collectorId: '30000000-0000-4000-8000-000000000001',
          pendingRecords: 9,
          pendingEvents: 9,
          pendingBatches: 1,
          acknowledgedRecordsRetained: 20,
          oldestPendingAt: '2026-08-12T11:59:00.000Z',
          spoolBytes: 4096,
          lastSyncAt: '2026-08-12T11:59:30.000Z',
          lastSyncError: ''
        }]
      }
    });
    expect(response.statusCode).toBe(200);
    expect(reportedTelemetry).toMatchObject({
      collectorTelemetry: [expect.objectContaining({ pendingRecords: 9, spoolBytes: 4096 })]
    });
    expect(response.json().collectors).toEqual([
      expect.objectContaining({ netflowPort: 30000, syslogPort: 30001 })
    ]);
    await app.close();
  });

  it('solicita o par exclusivo do servidor redundante', async () => {
    let secondaryPorts = false;
    const postgres = {
      touchManagedCloudCollectors: async () => undefined,
      listManagedCloudCollectorConfiguration: async (useSecondaryPorts: boolean) => {
        secondaryPorts = useSecondaryPorts;
        return [{
          tenantId: '20000000-0000-4000-8000-000000000001',
          collectorId: '30000000-0000-4000-8000-000000000001',
          name: 'Cloud ISP', netflowPort: 32000, syslogPort: 32001, devices: []
        }];
      }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerIngestionRoutes(app, {
      postgres, clickhouse: {} as ClickHouseRepository, managedCloudTokenHash: sha256(token),
      useSecondaryCloudPorts: () => true
    });
    const response = await app.inject({
      method: 'POST', url: '/v1/ingest/managed-cloud/registry',
      headers: { authorization: `Bearer ${token}` },
      payload: { version: '0.1.0', sentAt: '2026-08-12T12:00:00.000Z' }
    });
    expect(response.statusCode).toBe(200);
    expect(secondaryPorts).toBe(true);
    expect(response.json().collectors[0]).toMatchObject({ netflowPort: 32000, syslogPort: 32001 });
    await app.close();
  });

  it('aceita com a chave interna um lote pertencente a um Cloud ativo', async () => {
    const batchId = '40000000-0000-4000-8000-000000000001';
    const payload = Buffer.from('syslog cloud');
    const raw: RawRecord = {
      rawId: '50000000-0000-4000-8000-000000000001', batchId,
      tenantId: '20000000-0000-4000-8000-000000000001',
      collectorId: '30000000-0000-4000-8000-000000000001',
      deviceId: 'ffffffff-ffff-4fff-bfff-ffffffffffff', vendor: 'a10', sourceType: 'syslog',
      exporterIp: '192.0.2.10', exporterPort: 514, localSequence: 1,
      receivedAt: '2026-08-12T12:00:00.000Z', exporterTime: null,
      observationDomainId: null, exportSequence: null, templateId: null,
      payloadFormat: 'base64', rawPayload: payload.toString('base64'), rawSha256: sha256(payload),
      decodedJson: '{}', parseStatus: 'unrecognized', parserVersion: 'test/1', parseError: ''
    };
    const batch: IngestBatch = {
      batchId, tenantId: raw.tenantId, collectorId: raw.collectorId,
      checksum: batchChecksum([raw], []), createdAt: '2026-08-12T12:00:01.000Z',
      rawRecords: [raw], events: []
    };
    let activeCheck: string[] = [];
    const postgres = {
      findCollectorIdentityByTokenHash: async () => undefined,
      isActiveManagedCloudCollector: async (tenantId: string, collectorId: string) => {
        activeCheck = [tenantId, collectorId];
        return true;
      },
      registerBatches: async () => new Map([[batchId, { status: 'new' }]]),
      markBatchesCommitted: async () => undefined
    } as unknown as PostgresRepository;
    const clickhouse = {
      getBatchReceipts: async () => new Map(),
      insertBatchGroup: async () => undefined,
      inspectBatches: async () => new Map([[batchId, {
        rawIds: new Set([raw.rawId]), eventIds: new Set()
      }]]),
      recordBatchReceipts: async () => undefined
    } as unknown as ClickHouseRepository;
    const app = Fastify();
    registerIngestionRoutes(app, { postgres, clickhouse, managedCloudTokenHash: sha256(token) });
    const response = await app.inject({
      method: 'POST', url: '/v1/ingest/batches',
      headers: { authorization: `Bearer ${token}` }, payload: batch
    });
    expect(response.statusCode).toBe(200);
    expect(activeCheck).toEqual([batch.tenantId, batch.collectorId]);
    await app.close();
  });
});
