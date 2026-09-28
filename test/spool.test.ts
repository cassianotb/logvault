import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sha256 } from '../src/core/crypto.js';
import type { RawRecord } from '../src/domain/models.js';
import { CollectorSpool } from '../src/collector/spool.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('CollectorSpool', () => {
  it('mantém o mesmo lote até a confirmação e só limpa dados confirmados', () => {
    const directory = mkdtempSync(join(tmpdir(), 'argus-spool-'));
    directories.push(directory);
    const spool = new CollectorSpool(join(directory, 'spool.sqlite'));
    const payload = Buffer.from('evento original');
    const raw: RawRecord = {
      rawId: '30000000-0000-4000-8000-000000000001',
      batchId: null,
      tenantId: '30000000-0000-4000-8000-000000000002',
      collectorId: '30000000-0000-4000-8000-000000000003',
      deviceId: '30000000-0000-4000-8000-000000000004',
      vendor: 'a10',
      sourceType: 'syslog',
      exporterIp: '10.0.0.1',
      exporterPort: 514,
      localSequence: 0,
      receivedAt: '2026-08-07T12:00:00.000Z',
      exporterTime: null,
      observationDomainId: null,
      exportSequence: null,
      templateId: null,
      payloadFormat: 'base64',
      rawPayload: payload.toString('base64'),
      rawSha256: sha256(payload),
      decodedJson: '{}',
      parseStatus: 'unrecognized',
      parserVersion: 'test/1',
      parseError: ''
    };

    expect(spool.append(raw, [])).toBe(1);
    expect(spool.statistics()).toMatchObject({
      pendingRecords: 1,
      pendingEvents: 0,
      pendingBatches: 0,
      acknowledgedRecordsRetained: 0,
      oldestPendingAt: raw.receivedAt,
      lastSyncAt: null,
      lastSyncError: ''
    });
    const first = spool.nextBatch(100);
    const retry = spool.nextBatch(100);
    expect(first?.batchId).toBe(retry?.batchId);
    expect(first?.rawRecords[0]?.localSequence).toBe(1);
    expect(spool.statistics().pendingBatches).toBe(1);

    spool.acknowledge(first!.batchId, '2026-08-07T12:00:01.000Z');
    expect(spool.statistics()).toMatchObject({
      pendingRecords: 0,
      pendingBatches: 0,
      acknowledgedRecordsRetained: 1,
      lastSyncAt: '2026-08-07T12:00:01.000Z'
    });
    expect(spool.cleanupAcknowledged(0)).toBe(1);
    expect(spool.nextBatch(100)).toBeUndefined();
    spool.close();
  });

  it('persiste o cadastro de equipamentos para reinícios sem acesso à API', () => {
    const directory = mkdtempSync(join(tmpdir(), 'argus-registry-'));
    directories.push(directory);
    const path = join(directory, 'spool.sqlite');
    const devices = [{
      exporterIp: '192.0.2.10',
      deviceId: '30000000-0000-4000-8000-000000000010',
      vendor: 'cisco',
      timezone: 'America/Sao_Paulo'
    }];
    const first = new CollectorSpool(path);
    first.saveDeviceRegistry(devices);
    first.close();

    const reopened = new CollectorSpool(path);
    expect(reopened.loadDeviceRegistry()).toEqual(devices);
    reopened.close();
  });

  it('nunca mistura tenants ou coletores no mesmo lote Cloud', () => {
    const directory = mkdtempSync(join(tmpdir(), 'argus-cloud-spool-'));
    directories.push(directory);
    const spool = new CollectorSpool(join(directory, 'spool.sqlite'));
    const payload = Buffer.from('registro cloud');
    const base: RawRecord = {
      rawId: '30000000-0000-4000-8000-000000000101', batchId: null,
      tenantId: '30000000-0000-4000-8000-000000000201',
      collectorId: '30000000-0000-4000-8000-000000000301',
      deviceId: '30000000-0000-4000-8000-000000000401', vendor: 'a10', sourceType: 'syslog',
      exporterIp: '10.0.0.1', exporterPort: 514, localSequence: 0,
      receivedAt: '2026-08-12T12:00:00.000Z', exporterTime: null,
      observationDomainId: null, exportSequence: null, templateId: null,
      payloadFormat: 'base64', rawPayload: payload.toString('base64'), rawSha256: sha256(payload),
      decodedJson: '{}', parseStatus: 'unrecognized', parserVersion: 'test/1', parseError: ''
    };
    spool.append(base, []);
    spool.append({
      ...base,
      rawId: '30000000-0000-4000-8000-000000000102',
      tenantId: '30000000-0000-4000-8000-000000000202',
      collectorId: '30000000-0000-4000-8000-000000000302'
    }, []);

    expect(spool.statistics(base.tenantId, base.collectorId)).toMatchObject({
      pendingRecords: 1,
      pendingEvents: 0,
      pendingBatches: 0,
      lastSyncAt: null
    });
    expect(spool.statistics(
      '30000000-0000-4000-8000-000000000202',
      '30000000-0000-4000-8000-000000000302'
    ).pendingRecords).toBe(1);

    const first = spool.nextBatch(100)!;
    expect(first.rawRecords).toHaveLength(1);
    expect(first.rawRecords[0]).toMatchObject({ tenantId: first.tenantId, collectorId: first.collectorId });
    spool.acknowledge(first.batchId);
    const second = spool.nextBatch(100)!;
    expect(second.rawRecords).toHaveLength(1);
    expect(second.tenantId).not.toBe(first.tenantId);
    expect(second.collectorId).not.toBe(first.collectorId);
    spool.close();
  });
});
