import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { ClickHouseRepository } from '../src/api/clickhouse.js';
import { registerDeviceRoutes } from '../src/api/devices.js';
import type { AuthSession, PostgresRepository, TenantPlanUsage } from '../src/api/postgres.js';

const adminSession: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010',
  id: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000001',
  tenantName: 'ISP Teste',
  name: 'Administrador',
  email: 'admin@example.com',
  role: 'admin',
  platformAdmin: false,
  expiresAt: '2026-08-08T18:00:00.000Z'
};
const cookie = `argus_session=${'x'.repeat(32)}`;
const platformSession: AuthSession = {
  ...adminSession,
  tenantId: '00000000-0000-0000-0000-000000000000',
  tenantName: 'LogVault Plataforma',
  context: 'platform',
  homeTenantId: '00000000-0000-0000-0000-000000000000',
  homeTenantName: 'LogVault Plataforma',
  homeTenantTimezone: 'America/Sao_Paulo',
  platformAdmin: true
};
const usage: TenantPlanUsage = {
  code: 'device_1',
  name: '1 equipamento',
  deviceLimit: 1,
  devicesUsed: 1,
  devicesRemaining: 0
};

function dependencies(createResult: unknown) {
  const postgres = {
    findActiveSession: async () => adminSession,
    listDevices: async () => [],
    getTenantPlanUsage: async () => usage,
    createManagedDevice: async () => createResult
  } as unknown as PostgresRepository;
  const clickhouse = { getDeviceActivity: async () => [] } as unknown as ClickHouseRepository;
  return { postgres, clickhouse };
}

describe('limite de equipamentos do plano', () => {
  it('expõe o plano e o consumo no estado dos equipamentos', async () => {
    const app = Fastify();
    registerDeviceRoutes(app, dependencies({ status: 'collector_not_found' }));
    const response = await app.inject({ method: 'GET', url: '/v1/devices/status', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().plan).toEqual(usage);
    await app.close();
  });

  it('responde conflito quando o plano atingiu o limite', async () => {
    const app = Fastify();
    registerDeviceRoutes(app, dependencies({ status: 'device_limit_reached', usage }));
    const response = await app.inject({
      method: 'POST',
      url: '/v1/devices',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        collectorId: '30000000-0000-4000-8000-000000000001',
        name: 'Cisco ASR',
        vendor: 'cisco',
        model: 'ASR 1000',
        exporterIp: '192.0.2.10',
        timezone: 'America/Sao_Paulo',
        enabled: true
      }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'device_limit_reached', plan: usage });
    await app.close();
  });
});

describe('visão global dos equipamentos', () => {
  it('consolida equipamentos com cliente e coletor sem consultar um plano de cliente', async () => {
    const activityScopes: Array<string | null> = [];
    let planRequested = false;
    const postgres = {
      findActiveSession: async () => platformSession,
      listPlatformDevices: async () => [{
        id: '40000000-0000-4000-8000-000000000001',
        tenantId: '20000000-0000-4000-8000-000000000001', tenantName: 'ISP Teste',
        collectorId: '30000000-0000-4000-8000-000000000001', collectorName: 'Coletor POP',
        name: 'Cisco ASR', vendor: 'cisco', model: null, exporterIp: '192.0.2.10',
        timezone: 'America/Sao_Paulo', enabled: true
      }],
      getTenantPlanUsage: async () => {
        planRequested = true;
        return usage;
      }
    } as unknown as PostgresRepository;
    const clickhouse = {
      getDeviceActivity: async (tenantId: string | null) => {
        activityScopes.push(tenantId);
        return [{
          deviceId: '40000000-0000-4000-8000-000000000001',
          lastReceivedAt: '2099-08-13T12:00:00.000Z', rawRecords24h: 100,
          events24h: 90, parseFailures24h: 1
        }];
      }
    } as unknown as ClickHouseRepository;
    const app = Fastify();
    registerDeviceRoutes(app, { postgres, clickhouse });

    const response = await app.inject({ method: 'GET', url: '/v1/devices/status', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(activityScopes).toEqual([null]);
    expect(planRequested).toBe(false);
    expect(response.json()).toMatchObject({
      scope: 'platform', plan: null,
      summary: { total: 1, receiving: 1, clients: 1 },
      devices: [{ tenantName: 'ISP Teste', collectorName: 'Coletor POP', status: 'receiving' }]
    });
    await app.close();
  });
});
