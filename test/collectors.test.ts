import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { collectorConnectionStatus, newCollectorToken, registerCollectorRoutes } from '../src/api/collectors.js';
import { managedCloudCollectorConfigurationSchema } from '../src/domain/models.js';
import type { AuthSession, PostgresRepository } from '../src/api/postgres.js';

const session: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010',
  id: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000001',
  tenantName: 'ISP Teste', name: 'Administrador', email: 'admin@example.com',
  role: 'admin', platformAdmin: false, expiresAt: '2026-08-13T12:00:00.000Z'
};
const cookie = `argus_session=${'x'.repeat(32)}`;
const platformSession: AuthSession = {
  ...session,
  tenantId: '00000000-0000-0000-0000-000000000000',
  tenantName: 'LogVault Plataforma',
  context: 'platform',
  homeTenantId: '00000000-0000-0000-0000-000000000000',
  homeTenantName: 'LogVault Plataforma',
  homeTenantTimezone: 'America/Sao_Paulo',
  platformAdmin: true
};

describe('conexão do coletor', () => {
  const now = Date.parse('2026-08-07T15:00:00.000Z');

  it('usa o recebimento do heartbeat para classificar a conexão', () => {
    expect(collectorConnectionStatus('2026-08-07T14:59:45.000Z', now)).toBe('connected');
    expect(collectorConnectionStatus('2026-08-07T14:58:00.000Z', now)).toBe('delayed');
    expect(collectorConnectionStatus('2026-08-07T14:54:59.000Z', now)).toBe('offline');
  });

  it('não considera conectado sem telemetria válida', () => {
    expect(collectorConnectionStatus(null, now)).toBe('never');
    expect(collectorConnectionStatus('inválido', now)).toBe('never');
  });

  it('gera credenciais fortes e diferentes para cada coletor', () => {
    const first = newCollectorToken();
    const second = newCollectorToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
  });
});

describe('visão global dos coletores', () => {
  it('consolida os coletores e identifica o cliente no contexto da plataforma', async () => {
    const requestedTenants: Array<string | null> = [];
    const postgres = {
      findActiveSession: async () => platformSession,
      listCollectors: async (tenantId: string | null) => {
        requestedTenants.push(tenantId);
        return [{
          id: '30000000-0000-4000-8000-000000000001',
          tenantId: '20000000-0000-4000-8000-000000000001',
          tenantName: 'ISP Teste',
          name: 'Coletor POP', mode: 'edge', netflowPort: 30000, syslogPort: 30001,
          configuredStatus: 'online', version: '0.1.0', deviceCount: 2,
          lastSeenAt: '2099-08-13T12:00:00.000Z', telemetrySentAt: '2099-08-13T12:00:00.000Z',
          pendingRecords: 3, pendingEvents: 2, pendingBatches: 1,
          acknowledgedRecordsRetained: 0, oldestPendingAt: '2026-08-13T11:59:00.000Z',
          spoolBytes: 1024, lastSyncAt: '2026-08-13T11:59:30.000Z', lastSyncError: '',
          batches24h: 10, rawRecords24h: 100, events24h: 90, hostMetrics: null
        }];
      }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerCollectorRoutes(app, {
      postgres, cloudPortStart: 30000, cloudPortEnd: 31999,
      publicUrl: 'https://primary.example.com',
      redundancyDestination: async () => ({ publicUrl: 'https://secondary.example.com' })
    });

    const response = await app.inject({ method: 'GET', url: '/v1/collectors/status', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(requestedTenants).toEqual([null]);
    expect(response.json()).toMatchObject({
      scope: 'platform',
      summary: { total: 1, connected: 1, pendingRecords: 3 },
      collectors: [{ tenantName: 'ISP Teste', name: 'Coletor POP', connectionStatus: 'connected' }]
    });
    await app.close();
  });

  it('mostra na VM secundária o par local da faixa redundante', async () => {
    const postgres = {
      findActiveSession: async () => platformSession,
      listCollectors: async () => [{
        id: '30000000-0000-4000-8000-000000000001',
        tenantId: '20000000-0000-4000-8000-000000000001', tenantName: 'ISP Teste',
        name: 'Cloud ISP', mode: 'cloud', netflowPort: 30000, syslogPort: 30001,
        secondaryNetflowPort: 32000, secondarySyslogPort: 32001,
        configuredStatus: 'online', version: '1.1.3', deviceCount: 1,
        lastSeenAt: null, telemetrySentAt: null, pendingRecords: 0, pendingEvents: 0,
        pendingBatches: 0, acknowledgedRecordsRetained: 0, oldestPendingAt: null,
        spoolBytes: 0, lastSyncAt: null, lastSyncError: '', batches24h: 0,
        rawRecords24h: 0, events24h: 0, hostMetrics: null
      }]
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerCollectorRoutes(app, {
      postgres, cloudPortStart: 30000, cloudPortEnd: 31999,
      publicUrl: 'https://secondary.example.com',
      primaryPublicUrl: 'https://primary.example.com',
      useSecondaryCloudPorts: true
    });

    const response = await app.inject({ method: 'GET', url: '/v1/collectors/status', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json().collectors[0].ingressDestinations).toEqual([
      { role: 'primary', publicUrl: 'https://primary.example.com', netflowPort: 30000, syslogPort: 30001 },
      { role: 'secondary', publicUrl: 'https://secondary.example.com', netflowPort: 32000, syslogPort: 32001 }
    ]);
    await app.close();
  });
});

describe('coletor Cloud gerenciado', () => {
  it('mantém NetFlow e Syslog em portas consecutivas e distintas', () => {
    const base = {
      tenantId: '20000000-0000-4000-8000-000000000001',
      collectorId: '30000000-0000-4000-8000-000000000001',
      name: 'Cloud ISP', netflowPort: 30000, devices: []
    };
    expect(managedCloudCollectorConfigurationSchema.safeParse({ ...base, syslogPort: 30001 }).success).toBe(true);
    expect(managedCloudCollectorConfigurationSchema.safeParse({ ...base, syslogPort: 30000 }).success).toBe(false);
  });

  it('não entrega credencial ao cliente e informa o par de portas gerenciado', async () => {
    const postgres = {
      findActiveSession: async () => session,
      createManagedCollector: async () => ({
        status: 'created',
        collector: {
          id: '30000000-0000-4000-8000-000000000001', name: 'Cloud ISP', mode: 'cloud',
          netflowPort: 30012, syslogPort: 30013, configuredStatus: 'provisioned',
          secondaryNetflowPort: 32014, secondarySyslogPort: 32015,
          createdAt: '2026-08-12T12:00:00.000Z', updatedAt: '2026-08-12T12:00:00.000Z'
        }
      })
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerCollectorRoutes(app, {
      postgres, cloudPortStart: 30000, cloudPortEnd: 31999,
      publicUrl: 'https://primary.example.com',
      redundancyDestination: async () => ({ publicUrl: 'https://secondary.example.com' })
    });
    const response = await app.inject({
      method: 'POST', url: '/v1/collectors', headers: { cookie },
      payload: { name: 'Cloud ISP', mode: 'cloud' }
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      managed: true,
      ingress: {
        netflowPort: 30012, syslogPort: 30013,
        destinations: [
          { role: 'primary', publicUrl: 'https://primary.example.com', netflowPort: 30012, syslogPort: 30013 },
          { role: 'secondary', publicUrl: 'https://secondary.example.com', netflowPort: 32014, syslogPort: 32015 }
        ]
      },
      credentials: null
    });
    await app.close();
  });

  it('recusa um segundo Cloud no mesmo cliente', async () => {
    const postgres = {
      findActiveSession: async () => session,
      createManagedCollector: async () => ({ status: 'cloud_collector_already_exists' })
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerCollectorRoutes(app, { postgres, cloudPortStart: 30000, cloudPortEnd: 31999 });
    const response = await app.inject({
      method: 'POST', url: '/v1/collectors', headers: { cookie },
      payload: { name: 'Outro Cloud', mode: 'cloud' }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'cloud_collector_already_exists' });
    await app.close();
  });
});
