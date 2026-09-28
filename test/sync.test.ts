import { describe, expect, it, vi } from 'vitest';
import { BatchSynchronizer } from '../src/collector/sync.js';
import type { CollectorSpool } from '../src/collector/spool.js';

describe('BatchSynchronizer', () => {
  it('mantém o processo ativo quando o SQLite está temporariamente ocupado', async () => {
    let attempts = 0;
    const spool = {
      nextBatch: () => {
        attempts += 1;
        throw new Error('database is locked');
      }
    } as unknown as CollectorSpool;
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const synchronizer = new BatchSynchronizer(spool, {
      url: 'http://api.test/ingest',
      token: 'test',
      batchSize: 100,
      intervalMs: 1000,
      acknowledgedRetentionHours: 24,
      heartbeatUrl: 'http://api.test/heartbeat',
      heartbeatIntervalMs: 10000,
      tenantId: '10000000-0000-4000-8000-000000000001',
      collectorId: '10000000-0000-4000-8000-000000000002',
      version: 'test',
      netflowPort: 2055,
      syslogPort: 5140
    });

    await expect(synchronizer.tick()).resolves.toBeUndefined();
    await expect(synchronizer.tick()).resolves.toBeUndefined();
    expect(attempts).toBe(2);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('spool permanece preservado'));
    warning.mockRestore();
  });
});
