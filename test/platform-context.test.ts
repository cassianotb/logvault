import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerAuthRoutes } from '../src/api/auth.js';
import { registerDashboardRoutes } from '../src/api/dashboard.js';
import { registerPlatformRoutes } from '../src/api/platform.js';
import type { ClickHouseRepository } from '../src/api/clickhouse.js';
import type { AuthSession, PostgresRepository } from '../src/api/postgres.js';

const cookie = `argus_session=${'x'.repeat(32)}`;
const platformSession: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010',
  id: '10000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-0000-0000-000000000000',
  tenantName: 'LogVault Plataforma',
  tenantTimezone: 'America/Sao_Paulo',
  homeTenantId: '00000000-0000-0000-0000-000000000000',
  homeTenantName: 'LogVault Plataforma',
  homeTenantTimezone: 'America/Sao_Paulo',
  context: 'platform',
  name: 'Administrador',
  email: 'admin@example.com',
  role: 'admin',
  platformAdmin: true,
  expiresAt: '2026-08-14T18:00:00.000Z'
};

function registerAuth(postgres: PostgresRepository) {
  const app = Fastify();
  registerAuthRoutes(app, {
    postgres,
    sessionTtlHours: 12,
    cookieSecure: false,
    passwordResetTtlMinutes: 30,
    publicUrl: 'https://logvault.example.com',
    passwordResetMailer: { isConfigured: async () => false, send: vi.fn() }
  });
  return app;
}

describe('contexto do administrador da plataforma', () => {
  it('entrega o dashboard consolidado sem abrir o ambiente de um cliente', async () => {
    const postgres = {
      findActiveSession: async () => platformSession,
      listPlatformTenants: async () => [],
      listPlatformDevices: async () => []
    } as unknown as PostgresRepository;
    const getPlatformDashboardSnapshot = vi.fn(async () => ({ tenants: [], timeline: [] }));
    const clickhouse = {
      getDashboardSnapshot: vi.fn(),
      getPlatformDashboardSnapshot,
      getDeviceActivity: async () => []
    } as unknown as ClickHouseRepository;
    const app = Fastify();
    registerDashboardRoutes(app, { postgres, clickhouse });
    const response = await app.inject({ method: 'GET', url: '/v1/dashboard', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ scope: 'platform', summary: { clients: 0, totalEvents: 0 } });
    expect(clickhouse.getDashboardSnapshot).not.toHaveBeenCalled();
    expect(getPlatformDashboardSnapshot).toHaveBeenCalledOnce();
    await app.close();
  });

  it('consolida os registros por cliente e calcula a taxa somente dos últimos cinco minutos', async () => {
    const tenantId = '30000000-0000-4000-8000-000000000001';
    const postgres = {
      findActiveSession: async () => platformSession,
      listPlatformTenants: async () => [{
        id: tenantId,
        name: 'ISP Ativo',
        timezone: 'America/Sao_Paulo',
        active: true,
        deletionStatus: null,
        collectorCount: 1,
        enabledCollectorCount: 1,
        connectedCollectorCount: 1,
        enabledDeviceCount: 1
      }],
      listPlatformDevices: async () => [{
        id: '40000000-0000-4000-8000-000000000001',
        tenantId,
        tenantName: 'ISP Ativo',
        collectorId: null,
        collectorName: null,
        name: 'A10',
        vendor: 'a10',
        model: null,
        exporterIp: '203.0.113.10',
        timezone: 'America/Sao_Paulo',
        enabled: true
      }]
    } as unknown as PostgresRepository;
    const clickhouse = {
      getPlatformDashboardSnapshot: async () => ({
        tenants: [{
          tenantId,
          rawRecords: 1_200,
          totalEvents: 900,
          events5m: 600,
          parseFailures: 2,
          receivingDevices: 1,
          lastReceivedAt: '2026-08-13T14:30:00.000Z'
        }],
        timeline: []
      }),
      getDeviceActivity: async () => [{
        deviceId: '40000000-0000-4000-8000-000000000001',
        lastReceivedAt: new Date().toISOString(),
        rawRecords24h: 1_200,
        events24h: 900,
        parseFailures24h: 2
      }]
    } as unknown as ClickHouseRepository;
    const app = Fastify();
    registerDashboardRoutes(app, { postgres, clickhouse });
    const response = await app.inject({ method: 'GET', url: '/v1/dashboard', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().summary).toMatchObject({
      devices: 1,
      receivingDevices: 1,
      rawRecords: 1_200,
      totalEvents: 900,
      eventsPerSecond5m: 2,
      lastReceivedAt: '2026-08-13T14:30:00.000Z'
    });
    await app.close();
  });

  it('mantém a gestão global disponível sem tenant operacional', async () => {
    const postgres = {
      findActiveSession: async () => platformSession,
      listPlatformTenants: async () => [],
      listServicePlans: async () => []
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerPlatformRoutes(app, { postgres });
    const response = await app.inject({ method: 'GET', url: '/v1/platform/tenants', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().summary.total).toBe(0);
    await app.close();
  });

  it('troca para um cliente usando a sessão global', async () => {
    const calls: unknown[] = [];
    const postgres = {
      findActiveSession: async () => platformSession,
      setPlatformSessionTenantContext: async (input: unknown) => {
        calls.push(input);
        return 'updated';
      }
    } as unknown as PostgresRepository;
    const app = registerAuth(postgres);
    const tenantId = '30000000-0000-4000-8000-000000000001';
    const response = await app.inject({
      method: 'POST', url: '/v1/auth/context', headers: { cookie }, payload: { tenantId }
    });
    expect(response.statusCode).toBe(200);
    expect(calls[0]).toMatchObject({
      sessionId: platformSession.sessionId, actorUserId: platformSession.id, tenantId
    });
    await app.close();
  });
});
