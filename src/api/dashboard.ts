import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from './auth.js';
import type {
  ClickHouseRepository, DashboardTimelinePoint, PlatformDashboardTimelinePoint
} from './clickhouse.js';
import type { PostgresRepository } from './postgres.js';

const dashboardQuerySchema = z.object({
  period: z.enum(['24h', '7d', '30d']).default('24h')
});

const periodSettings = {
  '24h': { milliseconds: 24 * 60 * 60 * 1000, bucket: 'hour' as const, points: 24 },
  '7d': { milliseconds: 7 * 24 * 60 * 60 * 1000, bucket: 'day' as const, points: 7 },
  '30d': { milliseconds: 30 * 24 * 60 * 60 * 1000, bucket: 'day' as const, points: 30 }
};

export function fillDashboardTimeline(input: {
  points: DashboardTimelinePoint[];
  from: Date;
  to: Date;
  bucket: 'hour' | 'day';
}): DashboardTimelinePoint[] {
  const floor = (value: Date) => input.bucket === 'hour'
    ? new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), value.getUTCHours()))
    : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const byBucket = new Map(input.points.map((point) => [new Date(point.bucket).toISOString(), point]));
  const cursor = floor(input.from);
  const end = floor(input.to);
  const result: DashboardTimelinePoint[] = [];
  while (cursor <= end) {
    const bucket = cursor.toISOString();
    result.push(byBucket.get(bucket) ?? {
      bucket,
      allocations: 0,
      deallocations: 0
    });
    if (input.bucket === 'hour') cursor.setUTCHours(cursor.getUTCHours() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function fillPlatformDashboardTimeline(input: {
  points: PlatformDashboardTimelinePoint[];
  from: Date;
  to: Date;
  bucket: 'hour' | 'day';
}): PlatformDashboardTimelinePoint[] {
  const floor = (value: Date) => input.bucket === 'hour'
    ? new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), value.getUTCHours()))
    : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const byBucket = new Map(input.points.map((point) => [new Date(point.bucket).toISOString(), point]));
  const cursor = floor(input.from);
  const end = floor(input.to);
  const result: PlatformDashboardTimelinePoint[] = [];
  while (cursor <= end) {
    const bucket = cursor.toISOString();
    result.push(byBucket.get(bucket) ?? { bucket, rawRecords: 0, totalEvents: 0 });
    if (input.bucket === 'hour') cursor.setUTCHours(cursor.getUTCHours() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function registerDashboardRoutes(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository;
  clickhouse: ClickHouseRepository;
}): void {
  app.get('/v1/dashboard', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    const parsed = dashboardQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_dashboard_period' });
    const generatedAt = new Date();
    const settings = periodSettings[parsed.data.period];
    const from = new Date(generatedAt.getTime() - settings.milliseconds);
    if (session.context === 'platform') {
      const tenants = await dependencies.postgres.listPlatformTenants();
      const activeTenants = tenants.filter((tenant) => tenant.active && !tenant.deletionStatus);
      const activeTenantIds = new Set(activeTenants.map((tenant) => tenant.id));
      const [snapshot, registeredDevices, deviceActivity] = await Promise.all([
        dependencies.clickhouse.getPlatformDashboardSnapshot({
          tenantIds: [...activeTenantIds],
          from: from.toISOString(),
          to: generatedAt.toISOString(),
          bucket: settings.bucket
        }),
        dependencies.postgres.listPlatformDevices(),
        dependencies.clickhouse.getDeviceActivity(null)
      ]);
      const activeDevices = registeredDevices.filter((device) => activeTenantIds.has(device.tenantId));
      const activityByDevice = new Map(deviceActivity.map((activity) => [activity.deviceId, activity]));
      const receivingCutoff = generatedAt.getTime() - 5 * 60 * 1000;
      const receivingDevicesByTenant = new Map<string, number>();
      for (const device of activeDevices) {
        if (!device.enabled) continue;
        const lastReceivedAt = activityByDevice.get(device.id)?.lastReceivedAt;
        if (!lastReceivedAt || Date.parse(lastReceivedAt) < receivingCutoff) continue;
        receivingDevicesByTenant.set(device.tenantId, (receivingDevicesByTenant.get(device.tenantId) ?? 0) + 1);
      }
      const activityByTenant = new Map(snapshot.tenants.map((activity) => [activity.tenantId, activity]));
      const tenantRows = tenants.map((tenant) => {
        const activity = activityByTenant.get(tenant.id);
        return {
          ...tenant,
          receivingDevices: receivingDevicesByTenant.get(tenant.id) ?? 0,
          rawRecords: activity?.rawRecords ?? 0,
          totalEvents: activity?.totalEvents ?? 0,
          events5m: activity?.events5m ?? 0,
          parseFailures: activity?.parseFailures ?? 0,
          lastReceivedAt: activity?.lastReceivedAt ?? null
        };
      });
      return reply.send({
        generatedAt: generatedAt.toISOString(),
        scope: 'platform',
        period: parsed.data.period,
        from: from.toISOString(),
        to: generatedAt.toISOString(),
        summary: {
          clients: tenants.length,
          activeClients: activeTenants.length,
          collectors: activeTenants.reduce((sum, tenant) => sum + tenant.collectorCount, 0),
          connectedCollectors: activeTenants.reduce((sum, tenant) => sum + tenant.connectedCollectorCount, 0),
          devices: activeDevices.length,
          receivingDevices: tenantRows.reduce((sum, tenant) => sum + tenant.receivingDevices, 0),
          rawRecords: tenantRows.reduce((sum, tenant) => sum + tenant.rawRecords, 0),
          totalEvents: tenantRows.reduce((sum, tenant) => sum + tenant.totalEvents, 0),
          eventsPerSecond5m: tenantRows.reduce((sum, tenant) => sum + tenant.events5m, 0) / 300,
          parseFailures: tenantRows.reduce((sum, tenant) => sum + tenant.parseFailures, 0),
          lastReceivedAt: tenantRows.reduce<string | null>((latest, tenant) => {
            if (!tenant.lastReceivedAt) return latest;
            return !latest || Date.parse(tenant.lastReceivedAt) > Date.parse(latest) ? tenant.lastReceivedAt : latest;
          }, null)
        },
        tenants: tenantRows,
        timeline: fillPlatformDashboardTimeline({
          points: snapshot.timeline,
          from,
          to: generatedAt,
          bucket: settings.bucket
        }).slice(-settings.points)
      });
    }
    const snapshot = await dependencies.clickhouse.getDashboardSnapshot({
      tenantId: session.tenantId,
      from: from.toISOString(),
      to: generatedAt.toISOString(),
      bucket: settings.bucket
    });
    return reply.send({
      generatedAt: generatedAt.toISOString(),
      period: parsed.data.period,
      from: from.toISOString(),
      to: generatedAt.toISOString(),
      ...snapshot,
      timeline: fillDashboardTimeline({
        points: snapshot.timeline,
        from,
        to: generatedAt,
        bucket: settings.bucket
      }).slice(-settings.points)
    });
  });
}
