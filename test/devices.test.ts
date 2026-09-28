import { describe, expect, it } from 'vitest';
import { buildDeviceDiscoveryCandidates, deviceFreshnessStatus } from '../src/api/devices.js';

describe('estado de recebimento do equipamento', () => {
  const now = Date.parse('2026-08-07T15:00:00.000Z');

  it('classifica por idade do último pacote sem inventar atividade', () => {
    expect(deviceFreshnessStatus('2026-08-07T14:59:00.000Z', now)).toBe('receiving');
    expect(deviceFreshnessStatus('2026-08-07T14:30:00.000Z', now)).toBe('delayed');
    expect(deviceFreshnessStatus('2026-08-07T13:59:59.000Z', now)).toBe('offline');
  });

  it('mantém equipamento sem registro como nunca recebido', () => {
    expect(deviceFreshnessStatus(null, now)).toBe('never');
    expect(deviceFreshnessStatus('inválido', now)).toBe('never');
  });
});

describe('discovery temporário de equipamentos', () => {
  it('sugere somente origens novas e ignora os testes de saúde A10', () => {
    const candidates = buildDeviceDiscoveryCandidates([
      {
        exporterIp: '192.0.2.202', vendor: 'a10', sourceType: 'syslog', recordCount: 120,
        firstSeenAt: '2026-08-10T13:00:00.000Z', lastSeenAt: '2026-08-10T13:01:59.000Z',
        decodedJson: JSON.stringify({
          message: '<135>1 2026-08-10T10:01:59-03:00 192.0.2.202 A10-CGN-EXEMPLO - LSN:PortBatchV2Allocated:UDP [100.65.1.1 192.0.2.1 1024 1535]',
          transportIp: '10.250.1.94'
        })
      },
      {
        exporterIp: '10.250.1.94', vendor: 'a10', sourceType: 'syslog', recordCount: 24,
        firstSeenAt: '2026-08-10T13:00:00.000Z', lastSeenAt: '2026-08-10T13:01:59.000Z',
        decodedJson: '{"message":"A10"}'
      },
      {
        exporterIp: '192.0.2.50', vendor: 'cisco', sourceType: 'netflow_v9', recordCount: 30,
        firstSeenAt: '2026-08-10T13:00:00.000Z', lastSeenAt: '2026-08-10T13:01:59.000Z',
        decodedJson: '{}'
      }
    ], [{
      id: '10000000-0000-4000-8000-000000000001', collectorId: null, name: 'Cisco existente',
      vendor: 'cisco', model: null, exporterIp: '192.0.2.50', timezone: 'America/Sao_Paulo', enabled: true
    }]);

    expect(candidates).toEqual([expect.objectContaining({
      exporterIp: '192.0.2.202',
      transportIp: '10.250.1.94',
      suggestedName: 'A10-CGN-EXEMPLO',
      vendor: 'a10',
      recordCount: 120
    })]);
  });
});
