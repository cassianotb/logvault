import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  alertInvestigationGuidance,
  backupOperationalStatus,
  collectorSpoolAlert,
  registerSystemRoutes,
  validBackupId
} from '../src/api/system.js';
import type { ClickHouseRepository } from '../src/api/clickhouse.js';
import type { AuthSession, PostgresRepository } from '../src/api/postgres.js';

describe('investigação de alertas', () => {
  it('orienta o parsing sem sugerir descarte do registro bruto', () => {
    const guidance = alertInvestigationGuidance('parser');
    expect(guidance.explanation).toContain('preservou o registro bruto');
    expect(guidance.recommendedActions.join(' ')).toContain('templates');
  });
});

describe('estado operacional do backup', () => {
  const now = Date.parse('2026-08-07T18:00:00.000Z');

  it('classifica a idade conforme a janela configurada', () => {
    expect(backupOperationalStatus('2026-08-07T06:00:00.000Z', null, 24, now).status).toBe('ok');
    expect(backupOperationalStatus('2026-08-06T11:00:00.000Z', null, 24, now).status).toBe('delayed');
    expect(backupOperationalStatus('2026-08-05T17:00:00.000Z', null, 24, now).status).toBe('overdue');
  });

  it('detecta ausência e falha posterior ao último sucesso', () => {
    expect(backupOperationalStatus(null, null, 24, now).status).toBe('never');
    expect(backupOperationalStatus(
      '2026-08-07T17:00:00.000Z',
      '2026-08-07T17:30:00.000Z',
      24,
      now
    ).status).toBe('failed');
  });
});

describe('identificador de backup', () => {
  it('aceita apenas o formato UTC produzido pela rotina', () => {
    expect(validBackupId('20260807T163955Z')).toBe(true);
    expect(validBackupId('../20260807T163955Z')).toBe(false);
    expect(validBackupId('2026-08-07T16:39:55Z')).toBe(false);
  });
});

describe('download do backup completo', () => {
  it('não expõe o pacote global a um administrador de cliente', async () => {
    const tenantSession = {
      sessionId: '10000000-0000-4000-8000-000000000050',
      id: '10000000-0000-4000-8000-000000000051',
      tenantId: '20000000-0000-4000-8000-000000000052', tenantName: 'Cliente',
      tenantTimezone: 'America/Sao_Paulo', homeTenantId: '20000000-0000-4000-8000-000000000052',
      homeTenantName: 'Cliente', homeTenantTimezone: 'America/Sao_Paulo',
      name: 'Administrador', email: 'admin@cliente.example', role: 'admin',
      platformAdmin: false, context: 'tenant', expiresAt: '2026-12-01T00:00:00.000Z'
    } satisfies AuthSession;
    const app = Fastify();
    registerSystemRoutes(app, {
      postgres: { findActiveSession: async () => tenantSession } as unknown as PostgresRepository,
      clickhouse: {} as ClickHouseRepository,
      backupRoot: '/tmp/logvault-global-backups-not-exposed', backupExpectedHours: 24,
      backupRetentionDays: 15, backupRemoteEnabled: false
    });
    const response = await app.inject({
      method: 'GET', url: '/v1/system/backups/20260929T120000Z/download',
      headers: { cookie: `argus_session=${'x'.repeat(32)}` }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe('alerta da fila local do coletor', () => {
  const now = Date.parse('2026-08-11T14:00:00.000Z');
  const collector = {
    id: 'collector-1',
    name: 'Coletor Homologação',
    pendingRecords: 15,
    pendingEvents: 13,
    oldestPendingAt: '2026-08-11T13:59:50.000Z',
    lastSyncError: ''
  };

  it('ignora registros aguardando apenas o próximo ciclo normal de sincronização', () => {
    expect(collectorSpoolAlert(collector, now)).toBeUndefined();
    expect(collectorSpoolAlert({ ...collector, pendingRecords: 0, pendingEvents: 0 }, now)).toBeUndefined();
  });

  it('gera aviso quando o item mais antigo completa cinco minutos', () => {
    const alert = collectorSpoolAlert({
      ...collector,
      oldestPendingAt: '2026-08-11T13:55:00.000Z'
    }, now);

    expect(alert?.severity).toBe('warning');
    expect(alert?.detail).toContain('há 5.0 minuto(s)');
  });

  it('torna a fila crítica após trinta minutos', () => {
    const alert = collectorSpoolAlert({
      ...collector,
      oldestPendingAt: '2026-08-11T13:30:00.000Z'
    }, now);

    expect(alert?.severity).toBe('critical');
  });

  it('trata erro de sincronização como crítico imediatamente', () => {
    const alert = collectorSpoolAlert({
      ...collector,
      lastSyncError: 'API indisponível'
    }, now);

    expect(alert?.severity).toBe('critical');
    expect(alert?.detail).toContain('Erro de sincronização: API indisponível');
  });
});

describe('alertas globais da plataforma', () => {
  it('identifica o cliente afetado sem misturar os registros entre tenants', async () => {
    const tenantId = '20000000-0000-4000-8000-000000000021';
    const session = {
      sessionId: '10000000-0000-4000-8000-000000000020',
      id: '10000000-0000-4000-8000-000000000021',
      tenantId: '00000000-0000-0000-0000-000000000000',
      tenantName: 'LogVault Plataforma',
      tenantTimezone: 'America/Sao_Paulo',
      homeTenantId: '00000000-0000-0000-0000-000000000000',
      homeTenantName: 'LogVault Plataforma',
      homeTenantTimezone: 'America/Sao_Paulo',
      name: 'Administrador',
      email: 'admin@example.com',
      role: 'admin',
      platformAdmin: true,
      context: 'platform',
      expiresAt: '2026-08-14T18:00:00.000Z'
    } satisfies AuthSession;
    const postgres = {
      findActiveSession: async () => session,
      listPlatformTenants: async () => [{
        id: tenantId, name: 'ISP Cliente', active: true, collectorCount: 0,
        plan: { devicesUsed: 1 }
      }],
      listCollectors: async () => [],
      listDevices: async (requestedTenantId: string) => requestedTenantId === tenantId ? [{
        id: '30000000-0000-4000-8000-000000000021', collectorId: null,
        name: 'A10 Cliente', vendor: 'a10', model: null, exporterIp: '192.0.2.21',
        timezone: 'UTC', enabled: true
      }] : []
    } as unknown as PostgresRepository;
    const clickhouse = {
      getDeviceActivity: async (requestedTenantId: string) => requestedTenantId === tenantId ? [{
        deviceId: '30000000-0000-4000-8000-000000000021',
        lastReceivedAt: new Date().toISOString(), rawRecords24h: 1, events24h: 0, parseFailures24h: 1
      }] : []
    } as unknown as ClickHouseRepository;
    const app = Fastify();
    registerSystemRoutes(app, {
      postgres, clickhouse,
      backupRoot: '/tmp/argus-system-test-no-backups',
      backupExpectedHours: 24,
      backupRetentionDays: 15,
      backupDownloadTenantId: tenantId,
      backupRemoteEnabled: false
    });
    const response = await app.inject({
      method: 'GET', url: '/v1/system/status',
      headers: { cookie: `argus_session=${'x'.repeat(32)}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().scope).toBe('platform');
    expect(response.json().alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'backup', tenantName: 'Plataforma' }),
      expect.objectContaining({ source: 'parser', tenantId, tenantName: 'ISP Cliente' })
    ]));
    await app.close();
  });
});
