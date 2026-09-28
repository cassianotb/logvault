import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { HostMetrics } from '../core/host-metrics.js';
import { authenticateRequest } from './auth.js';
import {
  CLOUD_METRICS_TENANT_ID,
  type ClickHouseRepository,
  type ServerHistoryPeriod
} from './clickhouse.js';
import { collectorConnectionStatus } from './collectors.js';
import type { PostgresRepository } from './postgres.js';

export type ServerHealthStatus = 'healthy' | 'warning' | 'critical' | 'offline' | 'collecting' | 'disabled' | 'not_implemented';

const serverHistoryQuerySchema = z.object({
  serverId: z.string().max(128).refine(
    (value) => ['cloud-primary', 'cloud-standby'].includes(value) || /^collector:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value),
    'Servidor inválido'
  ),
  period: z.enum(['5m', '30m', '1h', '24h'])
});

function usagePercent(used: number | null, total: number | null): number | null {
  if (used === null || total === null || total <= 0) return null;
  return Math.round(Math.max(0, Math.min(100, used / total * 100)) * 100) / 100;
}

export function resourceHealthStatus(metrics: HostMetrics | null): ServerHealthStatus {
  if (!metrics) return 'collecting';
  const memory = usagePercent(metrics.memoryUsedBytes, metrics.memoryTotalBytes) ?? 0;
  const disk = usagePercent(metrics.diskUsedBytes, metrics.diskTotalBytes) ?? 0;
  const cpu = metrics.cpuUsagePercent ?? 0;
  if (cpu >= 95 || memory >= 95 || disk >= 95) return 'critical';
  if (cpu >= 80 || memory >= 85 || disk >= 85) return 'warning';
  return 'healthy';
}

function publicMetrics(metrics: HostMetrics | null) {
  return {
    hostname: metrics?.hostname ?? null,
    platform: metrics?.platform ?? null,
    uptimeSeconds: metrics?.uptimeSeconds ?? null,
    cpu: { usagePercent: metrics?.cpuUsagePercent ?? null },
    memory: {
      totalBytes: metrics?.memoryTotalBytes ?? null,
      usedBytes: metrics?.memoryUsedBytes ?? null,
      usagePercent: usagePercent(metrics?.memoryUsedBytes ?? null, metrics?.memoryTotalBytes ?? null)
    },
    storage: {
      totalBytes: metrics?.diskTotalBytes ?? null,
      usedBytes: metrics?.diskUsedBytes ?? null,
      usagePercent: usagePercent(metrics?.diskUsedBytes ?? null, metrics?.diskTotalBytes ?? null)
    }
  };
}

export function registerServerRoutes(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository;
  clickhouse: ClickHouseRepository;
  cloudMetricsProvider: () => HostMetrics;
  standbyMetricsProvider?: () => Promise<{ metrics: HostMetrics | null; sampledAt: string | null }>;
}): void {
  app.get('/v1/servers/status', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    const generatedAt = new Date();
    const cloudMetrics = dependencies.cloudMetricsProvider();
    const [continuitySettings, continuityEnrollment] = await Promise.all([
      dependencies.postgres.getPlatformContinuitySettings(),
      dependencies.postgres.getCurrentContinuityEnrollment()
    ]);
    const standbyRegistered = continuityEnrollment?.status === 'enrolled' && Boolean(continuitySettings);
    const standbySnapshot = standbyRegistered && dependencies.standbyMetricsProvider
      ? await dependencies.standbyMetricsProvider().catch(() => ({ metrics: null, sampledAt: null }))
      : { metrics: null, sampledAt: null };
    const allCollectors = session.context === 'platform'
      ? (await Promise.all((await dependencies.postgres.listPlatformTenants())
        .filter((tenant) => tenant.active)
        .map(async (tenant) => (await dependencies.postgres.listCollectors(tenant.id))
          .map((collector) => ({ ...collector, tenantId: tenant.id, tenantName: tenant.name })))))
        .flat()
      : (await dependencies.postgres.listCollectors(session.tenantId))
        .map((collector) => ({ ...collector, tenantId: session.tenantId, tenantName: session.tenantName }));
    const collectors = allCollectors.filter((collector) => collector.mode === 'edge');
    const cloudCollectorServices = allCollectors.filter((collector) => collector.mode === 'cloud').map((collector) => {
      const connection = collector.configuredStatus === 'disabled'
        ? 'disabled' as const : collectorConnectionStatus(collector.lastSeenAt, generatedAt.getTime());
      return {
        id: collector.id, name: collector.name,
        tenantName: session.context === 'platform' ? collector.tenantName : null,
        netflowPort: collector.netflowPort, syslogPort: collector.syslogPort,
        status: connection === 'disabled' ? 'disabled' as const
          : ['offline', 'never'].includes(connection) ? 'offline' as const
            : connection === 'delayed' ? 'warning' as const : 'healthy' as const
      };
    });
    const servers = [{
      id: 'cloud-primary',
      collectorId: null,
      name: 'Servidor principal',
      siteName: continuitySettings?.siteAName ?? 'Data Center A',
      infrastructureRole: 'primary' as const,
      tenantId: null,
      tenantName: session.context === 'platform' ? 'Plataforma' : null,
      location: 'cloud' as const,
      status: resourceHealthStatus(cloudMetrics),
      connectionStatus: 'connected',
      lastSeenAt: generatedAt.toISOString(),
      hostedCollectors: cloudCollectorServices.map((collector) => ({ ...collector, placement: 'active' as const })),
      ...publicMetrics(cloudMetrics)
    }, ...(standbyRegistered ? (() => {
      const inventory = continuityEnrollment.inventory ?? {};
      const inventoryDisks = typeof inventory.disksGiB === 'object' && inventory.disksGiB !== null
        ? inventory.disksGiB as Record<string, unknown> : {};
      const inventoryMemoryGiB = typeof inventory.memoryGiB === 'number' ? inventory.memoryGiB : null;
      const inventoryStorageGiB = Object.values(inventoryDisks)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        .reduce((total, value) => total + value, 0);
      const publicStandby = publicMetrics(standbySnapshot.metrics);
      if (!standbySnapshot.metrics) {
        publicStandby.hostname = typeof inventory.hostname === 'string' ? inventory.hostname : null;
        publicStandby.platform = typeof inventory.operatingSystem === 'string' ? inventory.operatingSystem : null;
        publicStandby.memory.totalBytes = inventoryMemoryGiB === null ? null : inventoryMemoryGiB * 1024 ** 3;
        publicStandby.storage.totalBytes = inventoryStorageGiB > 0 ? inventoryStorageGiB * 1024 ** 3 : null;
      }
      return [{
        id: 'cloud-standby', collectorId: null, name: 'Servidor de backup',
        siteName: continuitySettings!.siteBName, infrastructureRole: 'standby' as const,
        tenantId: null, tenantName: session.context === 'platform' ? 'Plataforma' : null,
        location: 'cloud' as const,
        status: standbySnapshot.metrics ? resourceHealthStatus(standbySnapshot.metrics) : 'offline' as const,
        connectionStatus: standbySnapshot.metrics ? 'connected' as const : 'offline' as const,
        lastSeenAt: standbySnapshot.sampledAt,
        hostedCollectors: cloudCollectorServices.map((collector) => ({ ...collector, placement: 'standby' as const })),
        ...publicStandby
      }];
    })() : [{
      id: 'cloud-standby', collectorId: null, name: 'Servidor de backup',
      siteName: continuitySettings?.siteBName ?? 'Data Center B', infrastructureRole: 'standby' as const,
      tenantId: null, tenantName: session.context === 'platform' ? 'Plataforma' : null,
      location: 'cloud' as const,
      status: continuityEnrollment?.status === 'pending' ? 'collecting' as const : 'not_implemented' as const,
      connectionStatus: continuityEnrollment?.status === 'pending' ? 'pending' as const : 'not_configured' as const,
      historyAvailable: false,
      lastSeenAt: null,
      hostedCollectors: cloudCollectorServices.map((collector) => ({ ...collector, placement: 'not_implemented' as const })),
      ...publicMetrics(null)
    }]), ...collectors.map((collector) => {
      const connection = collector.configuredStatus === 'disabled'
        ? 'disabled' as const
        : collectorConnectionStatus(collector.lastSeenAt, generatedAt.getTime());
      const status: ServerHealthStatus = connection === 'disabled'
        ? 'disabled'
        : ['offline', 'never'].includes(connection)
          ? 'offline'
          : connection === 'delayed'
            ? 'warning'
            : resourceHealthStatus(collector.hostMetrics ?? null);
      return {
        id: `collector:${collector.id}`,
        collectorId: collector.id,
        name: collector.name,
        tenantId: collector.tenantId,
        tenantName: session.context === 'platform' ? collector.tenantName : null,
        location: collector.mode,
        status,
        connectionStatus: connection,
        lastSeenAt: collector.lastSeenAt,
        ...publicMetrics(collector.hostMetrics ?? null)
      };
    })];
    const implementedServers = servers.filter((server) => server.status !== 'not_implemented'
      && (!('historyAvailable' in server) || server.historyAvailable !== false));
    return reply.send({
      generatedAt: generatedAt.toISOString(),
      summary: {
        total: implementedServers.length,
        healthy: servers.filter((server) => server.status === 'healthy').length,
        attention: servers.filter((server) => ['warning', 'critical', 'collecting'].includes(server.status)).length,
        offline: servers.filter((server) => ['offline', 'disabled'].includes(server.status)).length
      },
      thresholds: {
        cpuWarningPercent: 80,
        cpuCriticalPercent: 95,
        memoryWarningPercent: 85,
        memoryCriticalPercent: 95,
        storageWarningPercent: 85,
        storageCriticalPercent: 95
      },
      servers
    });
  });

  app.get('/v1/servers/history', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    const parsed = serverHistoryQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_history_query' });
    const { serverId, period } = parsed.data;
    let tenantId = CLOUD_METRICS_TENANT_ID;
    let name = 'Servidor principal';
    let tenantName: string | null = session.context === 'platform' ? 'Plataforma' : null;
    let location: 'cloud' | 'edge' = 'cloud';
    if (serverId === 'cloud-standby') {
      const [settings, enrollment] = await Promise.all([
        dependencies.postgres.getPlatformContinuitySettings(), dependencies.postgres.getCurrentContinuityEnrollment()
      ]);
      if (!settings || enrollment?.status !== 'enrolled') return reply.code(404).send({ error: 'server_not_found' });
      name = 'Servidor de backup';
      tenantName = session.context === 'platform' ? 'Plataforma' : null;
    } else if (serverId !== 'cloud-primary') {
      const collectorId = serverId.slice('collector:'.length);
      const collectors = session.context === 'platform'
        ? (await Promise.all((await dependencies.postgres.listPlatformTenants())
          .filter((tenant) => tenant.active)
          .map(async (tenant) => (await dependencies.postgres.listCollectors(tenant.id))
            .filter((collector) => collector.mode === 'edge')
            .map((collector) => ({ ...collector, tenantId: tenant.id, tenantName: tenant.name })))))
          .flat()
        : (await dependencies.postgres.listCollectors(session.tenantId))
          .filter((collector) => collector.mode === 'edge')
          .map((collector) => ({ ...collector, tenantId: session.tenantId, tenantName: session.tenantName }));
      const collector = collectors.find((candidate) => candidate.id === collectorId);
      if (!collector) return reply.code(404).send({ error: 'server_not_found' });
      tenantId = collector.tenantId;
      name = collector.name;
      tenantName = session.context === 'platform' ? collector.tenantName : null;
      location = collector.mode;
    }
    const points = await dependencies.clickhouse.getServerMetricHistory({
      tenantId,
      serverId,
      period: period as ServerHistoryPeriod
    });
    return reply.send({
      generatedAt: new Date().toISOString(),
      server: { id: serverId, name, location, tenantName },
      period,
      points
    });
  });
}
