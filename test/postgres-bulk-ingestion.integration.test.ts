import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { PostgresRepository } from '../src/api/postgres.js';
import type { IngestBatch } from '../src/domain/models.js';

const enabled = process.env.ARGUS_INTEGRATION_POSTGRES === 'true';
const batchIds = [
  '71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002'
];
const password = process.env.ARGUS_POSTGRES_PASSWORD ?? 'argus';
const connectionString = process.env.ARGUS_POSTGRES_TEST_URL
  ?? `postgresql://argus:${encodeURIComponent(password)}@127.0.0.1:5432/argus`;

describe.skipIf(!enabled)('registro PostgreSQL real de grupos de ingestão', () => {
  const tenantId = process.env.ARGUS_TENANT_ID ?? '';
  const collectorId = process.env.ARGUS_COLLECTOR_ID ?? '';
  const repository = new PostgresRepository(connectionString);
  const pool = new Pool({ connectionString });
  const cleanup = async () => {
    await pool.query('DELETE FROM sync_batches WHERE batch_id = ANY($1::uuid[])', [batchIds]);
  };
  const batches = batchIds.map((batchId, index) => ({
    batchId, tenantId, collectorId, checksum: String(index + 1).repeat(64),
    createdAt: '2026-10-02T12:00:00.000Z', rawRecords: [{}], events: []
  })) as IngestBatch[];

  beforeAll(async () => {
    if (!tenantId || !collectorId) throw new Error('ARGUS_TENANT_ID e ARGUS_COLLECTOR_ID são obrigatórios');
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
    await repository.close();
    await pool.end();
  });

  it('registra e confirma vários lotes de forma idempotente', async () => {
    expect([...await repository.registerBatches(batches)]).toEqual([
      [batchIds[0], { status: 'new' }], [batchIds[1], { status: 'new' }]
    ]);

    await repository.markBatchesCommitted(batchIds);

    expect([...await repository.registerBatches(batches)]).toEqual([
      [batchIds[0], { status: 'committed' }], [batchIds[1], { status: 'committed' }]
    ]);
    await expect(repository.registerBatches([
      { ...batches[0]!, checksum: 'f'.repeat(64) }
    ])).rejects.toThrow(/conteúdo divergente/);
  });
});
