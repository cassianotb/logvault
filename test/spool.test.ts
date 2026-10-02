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

  it('limita novos lotes por tamanho além da quantidade de registros', () => {
    const directory = mkdtempSync(join(tmpdir(), 'argus-spool-byte-limit-'));
    directories.push(directory);
    const spool = new CollectorSpool(join(directory, 'spool.sqlite'));
    const payload = Buffer.from('registro grande');
    const base: RawRecord = {
      rawId: '30500000-0000-4000-8000-000000000001', batchId: null,
      tenantId: '30500000-0000-4000-8000-000000000002',
      collectorId: '30500000-0000-4000-8000-000000000003',
      deviceId: '30500000-0000-4000-8000-000000000004', vendor: 'a10', sourceType: 'syslog',
      exporterIp: '10.0.0.1', exporterPort: 514, localSequence: 0,
      receivedAt: '2026-10-02T12:00:00.000Z', exporterTime: null,
      observationDomainId: null, exportSequence: null, templateId: null,
      payloadFormat: 'base64', rawPayload: payload.toString('base64'), rawSha256: sha256(payload),
      decodedJson: 'x'.repeat(1500), parseStatus: 'unrecognized', parserVersion: 'test/1', parseError: ''
    };
    spool.append(base, []);
    spool.append({ ...base, rawId: '30500000-0000-4000-8000-000000000005' }, []);

    const first = spool.nextBatch(100, 'primary', undefined, 4096)!;

    expect(first.rawRecords).toHaveLength(1);
    expect(spool.statistics()).toMatchObject({ pendingRecords: 2, pendingBatches: 1 });
    spool.close();
  });

  it('confirma cada destino de forma independente e retém o lote até ambos concluírem', () => {
    const directory = mkdtempSync(join(tmpdir(), 'argus-redundant-spool-'));
    directories.push(directory);
    const spool = new CollectorSpool(join(directory, 'spool.sqlite'));
    spool.configureDestinations(['primary', 'secondary']);
    const payload = Buffer.from('evento redundante');
    const raw: RawRecord = {
      rawId: '31000000-0000-4000-8000-000000000001', batchId: null,
      tenantId: '31000000-0000-4000-8000-000000000002',
      collectorId: '31000000-0000-4000-8000-000000000003',
      deviceId: '31000000-0000-4000-8000-000000000004', vendor: 'a10', sourceType: 'syslog',
      exporterIp: '10.0.0.10', exporterPort: 514, localSequence: 0,
      receivedAt: '2026-09-30T12:00:00.000Z', exporterTime: null,
      observationDomainId: null, exportSequence: null, templateId: null,
      payloadFormat: 'base64', rawPayload: payload.toString('base64'), rawSha256: sha256(payload),
      decodedJson: '{}', parseStatus: 'unrecognized', parserVersion: 'test/1', parseError: ''
    };
    spool.append(raw, []);

    const primary = spool.nextBatch(100, 'primary')!;
    const secondary = spool.nextBatch(100, 'secondary')!;
    expect(secondary.batchId).toBe(primary.batchId);
    spool.acknowledge(primary.batchId, '2026-09-30T12:00:01.000Z', 'primary');
    expect(spool.nextBatch(100, 'primary')).toBeUndefined();
    expect(spool.statistics()).toMatchObject({ pendingRecords: 1, pendingBatches: 1 });

    spool.recordFailure(secondary.batchId, 'secondary offline', 'secondary');
    expect(spool.nextBatch(100, 'secondary')?.batchId).toBe(primary.batchId);
    spool.acknowledge(secondary.batchId, '2026-09-30T12:00:02.000Z', 'secondary');
    expect(spool.statistics()).toMatchObject({
      pendingRecords: 0,
      pendingBatches: 0,
      acknowledgedRecordsRetained: 1,
      lastSyncAt: '2026-09-30T12:00:02.000Z'
    });

    expect(spool.requeueAcknowledged('secondary')).toEqual({
      destinationId: 'secondary', batches: 1, records: 1, events: 0
    });
    expect(spool.nextBatch(100, 'primary')).toBeUndefined();
    expect(spool.nextBatch(100, 'secondary')?.batchId).toBe(primary.batchId);
    expect(spool.statistics()).toMatchObject({ pendingRecords: 1, pendingBatches: 1 });
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

  it('não deixa um coletor Cloud removido bloquear o lote do novo cliente', () => {
    const directory = mkdtempSync(join(tmpdir(), 'argus-cloud-replacement-'));
    directories.push(directory);
    const spool = new CollectorSpool(join(directory, 'spool.sqlite'));
    const payload = Buffer.from('registro cloud substituído');
    const oldRecord: RawRecord = {
      rawId: '30000000-0000-4000-8000-000000000501', batchId: null,
      tenantId: '30000000-0000-4000-8000-000000000601',
      collectorId: '30000000-0000-4000-8000-000000000701',
      deviceId: '30000000-0000-4000-8000-000000000801', vendor: 'a10', sourceType: 'syslog',
      exporterIp: '10.0.0.1', exporterPort: 30001, localSequence: 0,
      receivedAt: '2026-09-29T12:00:00.000Z', exporterTime: null,
      observationDomainId: null, exportSequence: null, templateId: null,
      payloadFormat: 'base64', rawPayload: payload.toString('base64'), rawSha256: sha256(payload),
      decodedJson: '{}', parseStatus: 'unrecognized', parserVersion: 'test/1', parseError: ''
    };
    const newRecord: RawRecord = {
      ...oldRecord,
      rawId: '30000000-0000-4000-8000-000000000502',
      tenantId: '30000000-0000-4000-8000-000000000602',
      collectorId: '30000000-0000-4000-8000-000000000702',
      receivedAt: '2026-09-29T12:01:00.000Z'
    };

    spool.append(oldRecord, []);
    const rejected = spool.nextBatch(100)!;
    spool.recordFailure(rejected.batchId, 'HTTP 403 collector_identity_mismatch');
    spool.append(newRecord, []);

    const next = spool.nextBatch(100)!;
    expect(next.tenantId).toBe(newRecord.tenantId);
    expect(next.collectorId).toBe(newRecord.collectorId);
    expect(next.rawRecords).toHaveLength(1);
    expect(spool.statistics(oldRecord.tenantId, oldRecord.collectorId).lastSyncError)
      .toContain('collector_identity_mismatch');
    spool.close();
  });

  it('remove somente filas Cloud ausentes do registro e preserva a identidade base', () => {
    const directory = mkdtempSync(join(tmpdir(), 'argus-cloud-reconcile-'));
    directories.push(directory);
    const spool = new CollectorSpool(join(directory, 'spool.sqlite'));
    const payload = Buffer.from('registro para reconciliação');
    const baseRecord: RawRecord = {
      rawId: '30000000-0000-4000-8000-000000000901', batchId: null,
      tenantId: '30000000-0000-4000-8000-000000000911',
      collectorId: '30000000-0000-4000-8000-000000000921',
      deviceId: '30000000-0000-4000-8000-000000000931', vendor: 'cisco', sourceType: 'netflow_v9',
      exporterIp: '10.0.0.1', exporterPort: 30000, localSequence: 0,
      receivedAt: '2026-09-29T12:00:00.000Z', exporterTime: null,
      observationDomainId: 1, exportSequence: 1, templateId: 256,
      payloadFormat: 'base64', rawPayload: payload.toString('base64'), rawSha256: sha256(payload),
      decodedJson: '{}', parseStatus: 'parsed', parserVersion: 'test/1', parseError: ''
    };
    const removedRecord: RawRecord = {
      ...baseRecord,
      rawId: '30000000-0000-4000-8000-000000000902',
      tenantId: '30000000-0000-4000-8000-000000000912',
      collectorId: '30000000-0000-4000-8000-000000000922'
    };
    const activeRecord: RawRecord = {
      ...baseRecord,
      rawId: '30000000-0000-4000-8000-000000000903',
      tenantId: '30000000-0000-4000-8000-000000000913',
      collectorId: '30000000-0000-4000-8000-000000000923'
    };
    spool.append(removedRecord, []);
    const obsoleteBatch = spool.nextBatch(100)!;
    spool.recordFailure(obsoleteBatch.batchId, 'HTTP 403 collector_identity_mismatch');
    spool.append(baseRecord, []);
    spool.append(activeRecord, []);
    spool.put({
      exporterIp: `${removedRecord.collectorId}:${removedRecord.exporterIp}`,
      observationDomainId: 1,
      templateId: 256,
      fields: [{ type: 8, length: 4 }],
      updatedAt: '2026-09-29T12:00:00.000Z'
    });

    const result = spool.reconcileManagedCloudIdentities(
      [{ tenantId: activeRecord.tenantId, collectorId: activeRecord.collectorId }],
      { tenantId: baseRecord.tenantId, collectorId: baseRecord.collectorId }
    );

    expect(result).toEqual({
      identitiesRemoved: 1,
      recordsRemoved: 1,
      batchesRemoved: 1,
      templatesRemoved: 1
    });
    expect(spool.statistics(removedRecord.tenantId, removedRecord.collectorId).pendingRecords).toBe(0);
    expect(spool.statistics(activeRecord.tenantId, activeRecord.collectorId).pendingRecords).toBe(1);
    expect(spool.statistics(baseRecord.tenantId, baseRecord.collectorId).pendingRecords).toBe(1);
    expect(spool.get(`${removedRecord.collectorId}:${removedRecord.exporterIp}`, 1, 256)).toBeUndefined();
    spool.close();
  });
});
