import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { HostMetrics } from '../src/core/host-metrics.js';
import { collectorHeartbeatSchema } from '../src/domain/models.js';
import { registerServerRoutes, resourceHealthStatus } from '../src/api/servers.js';
import { CLOUD_METRICS_TENANT_ID, type ClickHouseRepository } from '../src/api/clickhouse.js';
import type { AuthSession, PostgresRepository } from '../src/api/postgres.js';

const metrics: HostMetrics = {
  hostname: 'argus-test',
  platform: 'linux test',
  uptimeSeconds: 3600,
  cpuUsagePercent: 25,
  memoryTotalBytes: 1000,
  memoryUsedBytes: 500,
  diskTotalBytes: 2000,
  diskUsedBytes: 1000
};
const session: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010',
  id: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000001',
  tenantName: 'ISP Teste',
  name: 'Operador',
  email: 'operador@example.com',
  role: 'operator',
  platformAdmin: false,
  expiresAt: '2026-08-08T18:00:00.000Z'
};
const cookie = `argus_session=${'x'.repeat(32)}`;

describe('saúde dos servidores', () => {
  it('mantém compatibilidade com coletores antigos e valida a nova amostra', () => {
    const heartbeat = {
      tenantId: session.tenantId,
      collectorId: '30000000-0000-4000-8000-000000000001',
      version: '1', sentAt: '2026-08-07T18:00:00.000Z',
      netflowPort: 2055, syslogPort: 5140,
      pendingRecords: 0, pendingEvents: 0, pendingBatches: 0, acknowledgedRecordsRetained: 0,
      oldestPendingAt: null, spoolBytes: 0, lastSyncAt: null, lastSyncError: ''
    };
    expect(collectorHeartbeatSchema.safeParse(heartbeat).success).toBe(true);
    expect(collectorHeartbeatSchema.safeParse({ ...heartbeat, hostMetrics: metrics }).success).toBe(true);
    expect(collectorHeartbeatSchema.safeParse({
      ...heartbeat, hostMetrics: { ...metrics, memoryUsedBytes: metrics.memoryTotalBytes + 1 }
    }).success).toBe(false);
  });

  it('classifica pressão de recursos pelos limites explícitos', () => {
    expect(resourceHealthStatus(metrics)).toBe('healthy');
    expect(resourceHealthStatus({ ...metrics, memoryUsedBytes: 900 })).toBe('warning');
    expect(resourceHealthStatus({ ...metrics, diskUsedBytes: 1950 })).toBe('critical');
    expect(resourceHealthStatus(null)).toBe('collecting');
  });

  it('retorna a nuvem e somente os coletores do tenant autenticado', async () => {
    const calls: string[] = [];
    const postgres = {
      findActiveSession: async () => session,
      getRedundancySettings: async () => ({ mode: 'standalone' }),
      listRedundancySites: async () => [],
      listCollectors: async (tenantId: string) => {
        calls.push(tenantId);
        return [{
          id: '30000000-0000-4000-8000-000000000001', name: 'Servidor local', mode: 'edge',
          configuredStatus: 'active', version: '1', deviceCount: 1, lastSeenAt: new Date().toISOString(),
          telemetrySentAt: new Date().toISOString(), pendingRecords: 0, pendingEvents: 0, pendingBatches: 0,
          acknowledgedRecordsRetained: 0, oldestPendingAt: null, spoolBytes: 0, lastSyncAt: null,
          lastSyncError: '', batches24h: 0, rawRecords24h: 0, events24h: 0, hostMetrics: metrics
        }];
      }
    } as unknown as PostgresRepository;
    const clickhouse = { getServerMetricHistory: async () => [] } as unknown as ClickHouseRepository;
    const app = Fastify();
    registerServerRoutes(app, {
      postgres, clickhouse, cloudMetricsProvider: () => metrics,
      localServerName: 'LOGVAULT-PRIMARIO', localRedundancyRole: 'standalone'
    });
    const response = await app.inject({ method: 'GET', url: '/v1/servers/status', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([session.tenantId]);
    expect(response.json().servers).toHaveLength(2);
    expect(response.json().summary.total).toBe(2);
    expect(response.json().servers[0]).toMatchObject({ id: 'cloud-primary', siteName: 'LOGVAULT-PRIMARIO' });
    expect(response.json().servers[1]).toMatchObject({ location: 'edge', status: 'healthy' });
    expect(response.json().servers[1].memory.usagePercent).toBe(50);
    await app.close();
  });

  it('consolida os coletores locais dos clientes no contexto da plataforma', async () => {
    const platformSession = {
      ...session,
      tenantId: '00000000-0000-0000-0000-000000000000',
      tenantName: 'LogVault Plataforma',
      context: 'platform',
      platformAdmin: true
    } as AuthSession;
    const firstTenantId = '20000000-0000-4000-8000-000000000011';
    const secondTenantId = '20000000-0000-4000-8000-000000000012';
    const postgres = {
      findActiveSession: async () => platformSession,
      getRedundancySettings: async () => ({ mode: 'standalone' }),
      listRedundancySites: async () => [],
      listPlatformTenants: async () => [
        { id: firstTenantId, name: 'ISP Norte', active: true },
        { id: secondTenantId, name: 'ISP Sul', active: true }
      ],
      listCollectors: async (tenantId: string) => [{
        id: tenantId === firstTenantId
          ? '30000000-0000-4000-8000-000000000011'
          : '30000000-0000-4000-8000-000000000012',
        name: tenantId === firstTenantId ? 'POP Norte' : 'POP Sul',
        mode: 'edge', configuredStatus: 'active', version: '1', deviceCount: 1,
        lastSeenAt: new Date().toISOString(), telemetrySentAt: new Date().toISOString(),
        pendingRecords: 0, pendingEvents: 0, pendingBatches: 0, acknowledgedRecordsRetained: 0,
        oldestPendingAt: null, spoolBytes: 0, lastSyncAt: null, lastSyncError: '',
        batches24h: 0, rawRecords24h: 0, events24h: 0, hostMetrics: metrics
      }]
    } as unknown as PostgresRepository;
    const clickhouse = { getServerMetricHistory: async () => [] } as unknown as ClickHouseRepository;
    const app = Fastify();
    registerServerRoutes(app, {
      postgres, clickhouse, cloudMetricsProvider: () => metrics,
      localServerName: 'LOGVAULT-PRIMARIO', localRedundancyRole: 'standalone'
    });
    const response = await app.inject({ method: 'GET', url: '/v1/servers/status', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json().servers).toHaveLength(3);
    expect(response.json().servers.slice(1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'POP Norte', tenantName: 'ISP Norte', tenantId: firstTenantId }),
      expect.objectContaining({ name: 'POP Sul', tenantName: 'ISP Sul', tenantId: secondTenantId })
    ]));
    await app.close();
  });

  it('exibe o servidor do DC-B entre o principal e os coletores e libera seu histórico', async () => {
    const collectorId = '30000000-0000-4000-8000-000000000021';
    const postgres = {
      findActiveSession: async () => session,
      getRedundancySettings: async () => ({ mode: 'primary' }),
      listRedundancySites: async () => [{
        id: '10000000-0000-4000-8000-000000000022', name: 'LOGVAULT-BACKUP', role: 'secondary',
        publicUrl: 'https://backup.example.com', status: 'active', version: '1.1.10',
        lastSeenAt: new Date().toISOString(), pairedAt: new Date().toISOString()
      }],
      listCollectors: async () => [{
        id: collectorId, name: 'POP Curitiba', mode: 'edge', configuredStatus: 'active', version: '1', deviceCount: 1,
        lastSeenAt: new Date().toISOString(), telemetrySentAt: new Date().toISOString(), pendingRecords: 0,
        pendingEvents: 0, pendingBatches: 0, acknowledgedRecordsRetained: 0, oldestPendingAt: null,
        spoolBytes: 0, lastSyncAt: null, lastSyncError: '', batches24h: 0, rawRecords24h: 0, events24h: 0,
        hostMetrics: metrics
      }, {
        id: '30000000-0000-4000-8000-000000000022', name: 'Cloud ISP', mode: 'cloud',
        netflowPort: 30000, syslogPort: 30001, configuredStatus: 'active', version: '1', deviceCount: 1,
        lastSeenAt: new Date().toISOString(), telemetrySentAt: new Date().toISOString(), pendingRecords: 0,
        pendingEvents: 0, pendingBatches: 0, acknowledgedRecordsRetained: 0, oldestPendingAt: null,
        spoolBytes: 0, lastSyncAt: null, lastSyncError: '', batches24h: 0, rawRecords24h: 0, events24h: 0,
        hostMetrics: null
      }]
    } as unknown as PostgresRepository;
    const historyCalls: unknown[] = [];
    const clickhouse = { getServerMetricHistory: async (input: unknown) => { historyCalls.push(input); return []; } } as unknown as ClickHouseRepository;
    const app = Fastify();
    registerServerRoutes(app, {
      postgres, clickhouse, cloudMetricsProvider: () => metrics,
      localServerName: 'LOGVAULT-PRIMARIO', localRedundancyRole: 'primary',
      standbyMetricsProvider: async () => ({ metrics: { ...metrics, hostname: 'argus-dc-b' }, sampledAt: new Date().toISOString() })
    });
    const status = await app.inject({ method: 'GET', url: '/v1/servers/status', headers: { cookie } });
    expect(status.statusCode).toBe(200);
    expect(status.json().servers.map((server: { id: string }) => server.id)).toEqual([
      'cloud-primary', 'cloud-standby', `collector:${collectorId}`
    ]);
    expect(status.json().servers[1]).toMatchObject({
      name: 'Servidor de backup', siteName: 'LOGVAULT-BACKUP', infrastructureRole: 'standby', status: 'healthy'
    });
    expect(status.json().servers[0].hostedCollectors).toEqual([
      expect.objectContaining({ name: 'Cloud ISP', placement: 'active', netflowPort: 30000, syslogPort: 30001 })
    ]);
    expect(status.json().servers[1].hostedCollectors).toEqual([
      expect.objectContaining({ name: 'Cloud ISP', placement: 'standby' })
    ]);

    const history = await app.inject({
      method: 'GET', url: '/v1/servers/history?serverId=cloud-standby&period=5m', headers: { cookie }
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().server).toMatchObject({ id: 'cloud-standby', name: 'Servidor de backup' });
    expect(historyCalls).toContainEqual({ tenantId: CLOUD_METRICS_TENANT_ID, serverId: 'cloud-standby', period: '5m' });
    await app.close();
  });

  it('retorna o histórico consolidado somente para um servidor permitido', async () => {
    const collectorId = '00000000-0000-0000-0000-000000000001';
    const postgres = {
      findActiveSession: async () => session,
      listCollectors: async () => [{
        id: collectorId,
        name: 'Servidor local',
        mode: 'edge'
      }]
    } as unknown as PostgresRepository;
    const historyCalls: unknown[] = [];
    const clickhouse = {
      getServerMetricHistory: async (input: unknown) => {
        historyCalls.push(input);
        return [{
          sampledAt: '2026-08-07T18:00:00.000Z',
          cpuUsagePercent: 20,
          memoryUsagePercent: 50,
          storageUsagePercent: 30,
          networkReceivedBytesPerSecond: 125000,
          networkTransmittedBytesPerSecond: 62500
        }];
      }
    } as unknown as ClickHouseRepository;
    const app = Fastify();
    registerServerRoutes(app, {
      postgres, clickhouse, cloudMetricsProvider: () => metrics,
      localServerName: 'LOGVAULT-PRIMARIO', localRedundancyRole: 'standalone'
    });
    const response = await app.inject({
      method: 'GET',
      url: `/v1/servers/history?serverId=collector:${collectorId}&period=30m`,
      headers: { cookie }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      server: { id: `collector:${collectorId}`, name: 'Servidor local', location: 'edge' },
      period: '30m',
      points: [{
        cpuUsagePercent: 20,
        memoryUsagePercent: 50,
        storageUsagePercent: 30,
        networkReceivedBytesPerSecond: 125000,
        networkTransmittedBytesPerSecond: 62500
      }]
    });
    expect(historyCalls).toEqual([{
      tenantId: session.tenantId,
      serverId: `collector:${collectorId}`,
      period: '30m'
    }]);

    const missing = await app.inject({
      method: 'GET',
      url: '/v1/servers/history?serverId=collector:40000000-0000-4000-8000-000000000001&period=5m',
      headers: { cookie }
    });
    expect(missing.statusCode).toBe(404);
    const invalid = await app.inject({
      method: 'GET',
      url: '/v1/servers/history?serverId=cloud-primary&period=7d',
      headers: { cookie }
    });
    expect(invalid.statusCode).toBe(400);
    await app.close();
  });
});
