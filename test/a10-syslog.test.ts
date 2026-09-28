import { describe, expect, it } from 'vitest';
import {
  A10SyslogParser,
  a10SyslogReportedIp,
  isA10HealthProbe,
  isA10IgnoredProtocolEvent
} from '../src/parsers/a10-syslog.js';

const context = {
  rawId: '10000000-0000-4000-8000-000000000001',
  tenantId: '10000000-0000-4000-8000-000000000002',
  collectorId: '10000000-0000-4000-8000-000000000003',
  deviceId: '10000000-0000-4000-8000-000000000004',
  vendor: 'a10',
  exporterIp: '192.0.2.202',
  exporterPort: 514,
  receivedAt: '2026-08-06T23:56:56.000Z'
};

describe('A10SyslogParser', () => {
  it.each([
    'LSN:PortAllocated:GRE [100.66.148.114 9146 198.51.100.174 23696]',
    'LSN:PortFreed:GRE [100.66.148.114 49854 198.51.100.174 23874]',
    'LSN:PortAllocated:ESP [100.65.155.162 0 198.51.100.206 0]',
    'LSN:PortFreed:ESP [100.65.155.162 0 198.51.100.206 0]'
  ])('identifica para descarte o protocolo A10 configurado em %s', (message) => {
    expect(isA10IgnoredProtocolEvent(message, ['GRE', 'ESP'])).toBe(true);
  });

  it('não descarta eventos TCP e UDP', () => {
    expect(isA10IgnoredProtocolEvent(
      'LSN:PortBatchV2Allocated:TCP [100.65.170.202 198.51.100.14 23040 23551]',
      ['GRE', 'ESP']
    )).toBe(false);
  });

  it('classifica a sonda A10 sem criar evento CGNAT nem falha de parsing', () => {
    const payload = Buffer.from('A10\0');
    const result = new A10SyslogParser().parse(payload, {
      ...context,
      exporterIp: '10.250.1.94',
      transportIp: '10.250.1.94'
    });

    expect(isA10HealthProbe(payload)).toBe(true);
    expect(result.status).toBe('health_probe');
    expect(result.events).toHaveLength(0);
    expect(result.error).toBe('');
    expect(result.decoded).toEqual({
      message: 'A10',
      kind: 'health_probe',
      transportIp: '10.250.1.94'
    });
  });

  it('normaliza o evento Freed explicitamente confirmado', () => {
    const payload = Buffer.from(
      '<134>1 2026-08-06T20:56:55-03:00 A10-CGN-EXEMPLO - - - LSN:PortBatchV2Freed:TCP [100.65.170.202 198.51.100.14 23040 23551]'
    );
    const result = new A10SyslogParser().parse(payload, context);

    expect(result.status).toBe('parsed');
    expect(result.exporterTime).toBe('2026-08-06T23:56:55.000Z');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      eventType: 'deallocated',
      eventTypeRaw: 'Freed',
      protocol: 6,
      protocolName: 'TCP',
      privateIp: '100.65.170.202',
      publicIp: '198.51.100.14',
      portStart: 23040,
      portEnd: 23551,
      portMode: 'contiguous',
      portCount: 512
    });
  });

  it('normaliza Allocated e identifica o remetente no cabeçalho RFC5424 real', () => {
    const payload = Buffer.from(
      '<135>1 2026-08-10T10:05:27-03:00 192.0.2.202 A10-CGN-EXEMPLO - LSN:PortBatchV2Allocated:UDP [100.65.145.63 203.0.113.255 59904 60415]'
    );
    const result = new A10SyslogParser().parse(payload, {
      ...context,
      exporterIp: '192.0.2.202',
      transportIp: '10.250.1.94'
    });

    expect(a10SyslogReportedIp(payload)).toBe('192.0.2.202');
    expect(result.status).toBe('parsed');
    expect(result.exporterTime).toBe('2026-08-10T13:05:27.000Z');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      eventType: 'allocated',
      eventTypeRaw: 'Allocated',
      protocol: 17,
      protocolName: 'UDP',
      privateIp: '100.65.145.63',
      publicIp: '203.0.113.255',
      portStart: 59904,
      portEnd: 60415,
      vendorFields: {
        reportedExporterIp: '192.0.2.202',
        transportIp: '10.250.1.94'
      }
    });
    expect(result.decoded).toMatchObject({
      reportedExporterIp: '192.0.2.202',
      transportIp: '10.250.1.94'
    });
  });

  it.each(['-', 'OTHER', 'Other'])(
    'expande a alocação compartilhada %s em estados TCP e UDP ligados ao mesmo log bruto',
    (protocol) => {
      const payload = Buffer.from(
        `<135>1 2026-08-12T10:00:00-03:00 192.0.2.202 A10-CGN-EXEMPLO - LSN:PortBatchV2Allocated:${protocol} [100.66.172.95 198.51.100.40 47104 47615]`
      );
      const result = new A10SyslogParser().parse(payload, context);

      expect(result.status).toBe('parsed');
      expect(result.events).toHaveLength(2);
      expect(result.events.map((event) => ({
        recordIndex: event.recordIndex,
        protocol: event.protocol,
        protocolName: event.protocolName,
        protocolRaw: event.vendorFields.protocolRaw,
        protocolScope: event.vendorFields.protocolScope
      }))).toEqual([
        { recordIndex: 0, protocol: 6, protocolName: 'TCP', protocolRaw: protocol, protocolScope: 'shared_tcp_udp' },
        { recordIndex: 1, protocol: 17, protocolName: 'UDP', protocolRaw: protocol, protocolScope: 'shared_tcp_udp' }
      ]);
      expect(result.events[0]?.eventId).not.toBe(result.events[1]?.eventId);
      expect(new Set(result.events.map((event) => event.rawId))).toEqual(new Set([context.rawId]));
    }
  );

  it('expande somente a desalocação compartilhada e não fabrica outros eventos', () => {
    const payload = Buffer.from(
      '<135>1 2026-08-12T23:34:11-03:00 192.0.2.202 A10-CGN-EXEMPLO - LSN:PortBatchV2Freed:- [100.66.172.95 198.51.100.40 47104 47615]'
    );
    const result = new A10SyslogParser().parse(payload, context);

    expect(result.status).toBe('parsed');
    expect(result.events).toHaveLength(2);
    expect(result.events.map((event) => ({ protocol: event.protocol, eventType: event.eventType }))).toEqual([
      { protocol: 6, eventType: 'deallocated' },
      { protocol: 17, eventType: 'deallocated' }
    ]);
  });

  it.each([
    ['TCP', 6],
    ['UDP', 17]
  ])('mantém a desalocação explícita de %s restrita a um protocolo', (protocol, protocolNumber) => {
    const payload = Buffer.from(
      `<135>1 2026-08-12T11:00:00-03:00 192.0.2.202 A10-CGN-EXEMPLO - LSN:PortBatchV2Freed:${protocol} [100.66.172.95 198.51.100.40 47104 47615]`
    );
    const result = new A10SyslogParser().parse(payload, context);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      protocol: protocolNumber,
      protocolName: protocol,
      eventType: 'deallocated',
      vendorFields: { protocolScope: 'single' }
    });
  });

  it('preserva uma ação ainda não mapeada sem fabricar alocação', () => {
    const payload = Buffer.from(
      '<134>1 2026-08-06T20:56:55-03:00 A10-CGN-EXEMPLO - - - LSN:PortBatchV2Created:UDP [100.65.170.202 198.51.100.14 23040 23551]'
    );
    const result = new A10SyslogParser().parse(payload, context);

    expect(result.status).toBe('decoded_unmapped');
    expect(result.events).toHaveLength(0);
    expect(result.error).toContain('Created');
  });

  it('não cria evento quando o timestamp explícito está ausente', () => {
    const payload = Buffer.from('LSN:PortBatchV2Freed:TCP [100.65.170.202 198.51.100.14 23040 23551]');
    const result = new A10SyslogParser().parse(payload, context);

    expect(result.status).toBe('decoded_unmapped');
    expect(result.events).toHaveLength(0);
    expect(result.error).toContain('timestamp');
  });
});
