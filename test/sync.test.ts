import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { batchChecksum, sha256 } from '../src/core/crypto.js';
import { BatchSynchronizer } from '../src/collector/sync.js';
import { CollectorSpool } from '../src/collector/spool.js';
import type { IngestBatch, RawRecord } from '../src/domain/models.js';

const tenantId = '10000000-0000-4000-8000-000000000001';
const collectorId = '10000000-0000-4000-8000-000000000002';

function options(destinationId: 'primary' | 'secondary') {
  return {
    destinationId,
    url: `http://${destinationId}.test/ingest`,
    token: 'test',
    batchSize: 100,
    intervalMs: 1000,
    acknowledgedRetentionHours: 24,
    heartbeatUrl: `http://${destinationId}.test/heartbeat`,
    heartbeatIntervalMs: 10000,
    tenantId,
    collectorId,
    version: 'test',
    netflowPort: 2055,
    syslogPort: 5140
  };
}

function rawRecord(rawId: string, receivedAt: string): RawRecord {
  const payload = Buffer.from(rawId);
  return {
    rawId, batchId: null, tenantId, collectorId,
    deviceId: '10000000-0000-4000-8000-000000000003',
    vendor: 'a10', sourceType: 'syslog', exporterIp: '192.0.2.10', exporterPort: 514,
    localSequence: 0, receivedAt, exporterTime: null, observationDomainId: null,
    exportSequence: null, templateId: null, payloadFormat: 'base64',
    rawPayload: payload.toString('base64'), rawSha256: sha256(payload), decodedJson: '{}',
    parseStatus: 'unrecognized', parserVersion: 'test/1', parseError: ''
  };
}

describe('BatchSynchronizer', () => {
  it('não reabre lotes já confirmados quando um destino volta', async () => {
    const requeueAcknowledged = vi.fn(() => ({
      destinationId: 'secondary', batches: 2, records: 3, events: 72
    }));
    const spool = {
      statistics: vi.fn(() => ({
        pendingRecords: 0, pendingEvents: 0, pendingBatches: 0,
        acknowledgedRecordsRetained: 3, oldestPendingAt: null,
        spoolBytes: 1024, lastSyncAt: null, lastSyncError: ''
      })),
      requeueAcknowledged
    } as unknown as CollectorSpool;
    const heartbeatSender = vi.fn()
      .mockRejectedValueOnce(new Error('secondary offline'))
      .mockResolvedValueOnce({ status: 'recorded', receivedAt: new Date().toISOString(), devices: [] });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const synchronizer = new BatchSynchronizer(
      spool, options('secondary'), undefined, heartbeatSender
    );

    await synchronizer.heartbeat();
    expect(requeueAcknowledged).not.toHaveBeenCalled();
    await synchronizer.heartbeat();

    expect(requeueAcknowledged).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining('recuperadas em grupo'));
    warning.mockRestore();
    info.mockRestore();
  });

  it('mantém o processo ativo quando o SQLite está temporariamente ocupado', async () => {
    let attempts = 0;
    const spool = {
      pendingBatches: () => [],
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
      tenantId,
      collectorId,
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

  it.each(['primary', 'secondary'] as const)(
    'continua entregando quando %s fica offline e recupera seu backlog',
    async (offlineDestination) => {
      const directory = mkdtempSync(join(tmpdir(), 'argus-independent-sync-'));
      const spool = new CollectorSpool(join(directory, 'spool.sqlite'));
      try {
        spool.configureDestinations(['primary', 'secondary']);
        spool.append(rawRecord('11000000-0000-4000-8000-000000000001', '2026-10-01T12:00:00.000Z'), []);

        const available = { primary: offlineDestination !== 'primary', secondary: offlineDestination !== 'secondary' };
        const delivered: Record<'primary' | 'secondary', string[]> = { primary: [], secondary: [] };
        const synchronizers = {
          primary: new BatchSynchronizer(spool, options('primary'), async (batch: IngestBatch) => {
            if (!available.primary) throw new Error('primary offline');
            delivered.primary.push(batch.batchId);
          }),
          secondary: new BatchSynchronizer(spool, options('secondary'), async (batch: IngestBatch) => {
            if (!available.secondary) throw new Error('secondary offline');
            delivered.secondary.push(batch.batchId);
          })
        };
        const availableDestination = offlineDestination === 'primary' ? 'secondary' : 'primary';

        await synchronizers[offlineDestination].tick();
        await synchronizers[availableDestination].tick();
        expect(delivered[availableDestination]).toHaveLength(1);

        spool.append(rawRecord('11000000-0000-4000-8000-000000000002', '2026-10-01T12:00:01.000Z'), []);
        await synchronizers[availableDestination].tick();
        expect(delivered[availableDestination]).toHaveLength(2);
        expect(spool.statistics()).toMatchObject({ pendingRecords: 2, pendingBatches: 2 });

        available[offlineDestination] = true;
        await synchronizers[offlineDestination].tick();
        await synchronizers[offlineDestination].tick();

        expect([...delivered.primary].sort()).toEqual([...delivered.secondary].sort());
        expect(spool.statistics()).toMatchObject({
          pendingRecords: 0,
          pendingBatches: 0,
          acknowledgedRecordsRetained: 2
        });
      } finally {
        spool.close();
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );

  it('preserva seis horas com as duas VMs offline, sobrevive a reinício e retransmite tudo', async () => {
    vi.useFakeTimers();
    const directory = mkdtempSync(join(tmpdir(), 'argus-both-offline-sync-'));
    const spoolPath = join(directory, 'spool.sqlite');
    let spool = new CollectorSpool(spoolPath);
    try {
      vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'));
      spool.configureDestinations(['primary', 'secondary']);
      const offlineSender = async () => { throw new Error('destination offline'); };
      const primaryOffline = new BatchSynchronizer(spool, options('primary'), offlineSender);
      const secondaryOffline = new BatchSynchronizer(spool, options('secondary'), offlineSender);

      spool.append(rawRecord('13000000-0000-4000-8000-000000000001', '2026-10-01T00:00:00.000Z'), []);
      await primaryOffline.tick();
      await secondaryOffline.tick();

      vi.setSystemTime(new Date('2026-10-01T06:00:01.000Z'));
      spool.append(rawRecord('13000000-0000-4000-8000-000000000002', '2026-10-01T06:00:01.000Z'), []);
      await primaryOffline.tick();
      await secondaryOffline.tick();
      expect(spool.statistics()).toMatchObject({ pendingRecords: 2, pendingBatches: 1 });

      spool.close();
      spool = new CollectorSpool(spoolPath);
      spool.configureDestinations(['primary', 'secondary']);
      expect(spool.cleanupAcknowledged(0)).toBe(0);
      expect(spool.statistics()).toMatchObject({ pendingRecords: 2, pendingBatches: 1 });

      const delivered: Record<'primary' | 'secondary', string[]> = { primary: [], secondary: [] };
      const primaryOnline = new BatchSynchronizer(spool, options('primary'), async (batch) => {
        delivered.primary.push(batch.batchId);
      });
      const secondaryOnline = new BatchSynchronizer(spool, options('secondary'), async (batch) => {
        delivered.secondary.push(batch.batchId);
      });
      await primaryOnline.tick();
      await primaryOnline.tick();
      await secondaryOnline.tick();
      await secondaryOnline.tick();

      expect(delivered.primary).toHaveLength(2);
      expect([...delivered.primary].sort()).toEqual([...delivered.secondary].sort());
      expect(spool.statistics()).toMatchObject({
        pendingRecords: 0,
        pendingBatches: 0,
        acknowledgedRecordsRetained: 2
      });
    } finally {
      spool.close();
      rmSync(directory, { recursive: true, force: true });
      vi.useRealTimers();
    }
  });

  it('limita o tempo da requisição de envio de lote', async () => {
    const raw = rawRecord('12000000-0000-4000-8000-000000000002', '2026-10-01T12:00:00.000Z');
    const batch: IngestBatch = {
      batchId: '12000000-0000-4000-8000-000000000001', tenantId, collectorId,
      checksum: batchChecksum([{ ...raw, batchId: '12000000-0000-4000-8000-000000000001' }], []),
      createdAt: '2026-10-01T12:00:01.000Z',
      rawRecords: [{ ...raw, batchId: '12000000-0000-4000-8000-000000000001' }], events: []
    };
    const spool = {
      pendingBatches: vi.fn().mockReturnValue([]),
      nextBatch: vi.fn()
        .mockReturnValueOnce(batch)
        .mockReturnValue(undefined),
      acknowledge: vi.fn(),
      cleanupAcknowledged: vi.fn(),
      recordFailure: vi.fn()
    } as unknown as CollectorSpool;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json({
        batchId: batch.batchId, status: 'committed', checksum: batch.checksum,
        rawCount: 1, eventCount: 0, duplicate: false, repaired: false
      });
    });
    const synchronizer = new BatchSynchronizer(spool, options('primary'));

    await synchronizer.tick();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(spool.acknowledge).toHaveBeenCalledOnce();
    fetchMock.mockRestore();
  });

  it('não confirma um HTTP 200 sem comprovante válido de persistência', async () => {
    const raw = rawRecord('14000000-0000-4000-8000-000000000002', '2026-10-01T12:00:00.000Z');
    const batchId = '14000000-0000-4000-8000-000000000001';
    const preparedRaw = { ...raw, batchId };
    const batch: IngestBatch = {
      batchId, tenantId, collectorId, checksum: batchChecksum([preparedRaw], []),
      createdAt: '2026-10-01T12:00:01.000Z', rawRecords: [preparedRaw], events: []
    };
    const spool = {
      pendingBatches: vi.fn().mockReturnValue([]),
      nextBatch: vi.fn().mockReturnValue(batch), acknowledge: vi.fn(),
      cleanupAcknowledged: vi.fn(), recordFailure: vi.fn()
    } as unknown as CollectorSpool;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>proxy fallback</html>', { status: 200, headers: { 'content-type': 'text/html' } })
    );

    await new BatchSynchronizer(spool, options('secondary')).tick();

    expect(spool.acknowledge).not.toHaveBeenCalled();
    expect(spool.recordFailure).toHaveBeenCalledWith(
      batchId, expect.stringMatching(/JSON|Unexpected token/i), 'secondary'
    );
    fetchMock.mockRestore();
  });

  it('preserva a vazão normal drenando até quatro lotes novos por ciclo', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'argus-fresh-drain-'));
    const spool = new CollectorSpool(join(directory, 'spool.sqlite'));
    try {
      spool.configureDestinations(['primary']);
      for (let index = 1; index <= 5; index += 1) {
        spool.append(rawRecord(
          `14500000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          new Date(Date.parse('2026-10-01T12:00:00.000Z') + index).toISOString()
        ), []);
      }
      const delivered: string[] = [];
      const synchronizer = new BatchSynchronizer(
        spool, { ...options('primary'), batchSize: 1, maxBatchesPerTick: 4 },
        async (value) => { delivered.push(value.batchId); }
      );

      await synchronizer.tick();

      expect(delivered).toHaveLength(4);
      expect(spool.statistics().pendingRecords).toBe(1);
    } finally {
      spool.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('recupera vários lotes originais em uma única requisição agrupada', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'argus-bounded-drain-'));
    const spool = new CollectorSpool(join(directory, 'spool.sqlite'));
    try {
      spool.configureDestinations(['primary', 'secondary']);
      for (let index = 1; index <= 100; index += 1) {
        spool.append(rawRecord(
          `15000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          new Date(Date.parse('2026-10-01T12:00:00.000Z') + index).toISOString()
        ), []);
      }
      const primary = new BatchSynchronizer(spool, {
        ...options('primary'), batchSize: 1
      }, async () => undefined);
      for (let index = 0; index < 100; index += 1) await primary.tick();

      const groupSender = vi.fn(async (batches: IngestBatch[]) => ({
        receipts: batches.map((batch) => ({
          batchId: batch.batchId, status: 'committed' as const, checksum: batch.checksum,
          rawCount: batch.rawRecords.length, eventCount: batch.events.length,
          duplicate: false, repaired: false
        })),
        failures: []
      }));
      const secondary = new BatchSynchronizer(
        spool, { ...options('secondary'), recoveryBatchSize: 100 },
        undefined, undefined, undefined, undefined, groupSender
      );
      await secondary.tick();

      expect(groupSender).toHaveBeenCalledOnce();
      expect(groupSender.mock.calls[0]?.[0]).toHaveLength(100);
      expect(spool.statistics()).toMatchObject({ pendingRecords: 0, pendingBatches: 0 });
    } finally {
      spool.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('confirma sucessos individuais e mantém somente a falha parcial na fila', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'argus-partial-bulk-'));
    const spool = new CollectorSpool(join(directory, 'spool.sqlite'));
    try {
      spool.configureDestinations(['primary', 'secondary']);
      const primary = new BatchSynchronizer(spool, { ...options('primary'), batchSize: 1 }, async () => undefined);
      for (let index = 1; index <= 2; index += 1) {
        spool.append(rawRecord(
          `16000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          `2026-10-01T12:01:0${index}.000Z`
        ), []);
        await primary.tick();
      }

      let request = 0;
      const groupSizes: number[] = [];
      const groupSender = vi.fn(async (batches: IngestBatch[]) => {
        request += 1;
        groupSizes.push(batches.length);
        const committed = request === 1 ? batches.slice(0, 1) : batches;
        const failed = request === 1 ? batches.slice(1) : [];
        return {
          receipts: committed.map((batch) => ({
            batchId: batch.batchId, status: 'committed' as const, checksum: batch.checksum,
            rawCount: batch.rawRecords.length, eventCount: batch.events.length,
            duplicate: false, repaired: false
          })),
          failures: failed.map((batch) => ({ batchId: batch.batchId, error: 'temporary_failure' }))
        };
      });
      const secondary = new BatchSynchronizer(
        spool, options('secondary'), undefined, undefined, undefined, undefined, groupSender
      );

      await secondary.tick();
      expect(spool.statistics()).toMatchObject({ pendingRecords: 1, pendingBatches: 1 });
      await secondary.tick();

      expect(groupSizes).toEqual([2, 1]);
      expect(spool.statistics()).toMatchObject({ pendingRecords: 0, pendingBatches: 0 });
    } finally {
      spool.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
