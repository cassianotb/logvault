import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from './auth.js';
import type { ClickHouseRepository, DeviceDiscoveryObservation } from './clickhouse.js';
import type { AuthSession, DeviceDefinition, PostgresRepository } from './postgres.js';

export type DeviceFreshnessStatus = 'receiving' | 'delayed' | 'offline' | 'never';

const vendorSchema = z.enum(['cisco', 'a10']);
const deviceBodySchema = z.object({
  collectorId: z.string().uuid(),
  name: z.string().trim().min(2).max(200),
  vendor: vendorSchema,
  model: z.string().trim().max(200).optional().default('').transform((value) => value || null),
  exporterIp: z.string().ip({ version: 'v4' }),
  timezone: z.string().min(1).max(100).default('America/Sao_Paulo'),
  enabled: z.boolean().default(true)
});
const deviceIdSchema = z.object({ deviceId: z.string().uuid() });
const discoveryBodySchema = z.object({ collectorId: z.string().uuid() });
const discoveryIdSchema = z.object({ discoveryId: z.string().uuid() });
const DISCOVERY_DURATION_SECONDS = 120;
const RFC5424_HOSTNAME_PATTERN = /^<\d{1,3}>1\s+\S+\s+\S+\s+(?<hostname>\S+)\s+/;

export interface DeviceDiscoveryCandidate {
  exporterIp: string;
  transportIp: string | null;
  suggestedName: string;
  vendor: 'cisco' | 'a10';
  sourceType: string;
  recordCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

function decodedFields(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function buildDeviceDiscoveryCandidates(
  observations: DeviceDiscoveryObservation[],
  registeredDevices: DeviceDefinition[]
): DeviceDiscoveryCandidate[] {
  const registeredIps = new Set(registeredDevices.map((device) => device.exporterIp));
  return observations.flatMap((observation) => {
    if (registeredIps.has(observation.exporterIp)) return [];
    const decoded = decodedFields(observation.decodedJson);
    const message = typeof decoded.message === 'string' ? decoded.message.trim() : '';
    if (message === 'A10') return [];
    const vendor: DeviceDiscoveryCandidate['vendor'] = observation.sourceType === 'netflow_v9' ? 'cisco' : 'a10';
    const hostname = message ? RFC5424_HOSTNAME_PATTERN.exec(message)?.groups?.hostname : undefined;
    const transportIp = typeof decoded.transportIp === 'string' && decoded.transportIp !== observation.exporterIp
      ? decoded.transportIp
      : null;
    return [{
      exporterIp: observation.exporterIp,
      transportIp,
      suggestedName: hostname || `${vendor.toUpperCase()} ${observation.exporterIp}`,
      vendor,
      sourceType: observation.sourceType,
      recordCount: observation.recordCount,
      firstSeenAt: observation.firstSeenAt,
      lastSeenAt: observation.lastSeenAt
    }];
  }).sort((left, right) => right.recordCount - left.recordCount || left.exporterIp.localeCompare(right.exporterIp));
}

function requireAdmin(session: AuthSession, reply: FastifyReply): boolean {
  if (session.role === 'admin') return true;
  void reply.code(403).send({ error: 'administrator_required' });
  return false;
}

function postgresErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export function deviceFreshnessStatus(lastReceivedAt: string | null, nowMs = Date.now()): DeviceFreshnessStatus {
  if (!lastReceivedAt) return 'never';
  const receivedMs = new Date(lastReceivedAt).getTime();
  if (!Number.isFinite(receivedMs)) return 'never';
  const ageSeconds = Math.max(0, (nowMs - receivedMs) / 1000);
  if (ageSeconds <= 5 * 60) return 'receiving';
  if (ageSeconds <= 60 * 60) return 'delayed';
  return 'offline';
}

export function registerDeviceRoutes(
  app: FastifyInstance,
  dependencies: { postgres: PostgresRepository; clickhouse: ClickHouseRepository }
): void {
  app.post('/v1/devices/discovery', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireAdmin(session, reply)) return;
    const body = discoveryBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_discovery_request' });
    const result = await dependencies.postgres.createDeviceDiscoverySession({
      tenantId: session.tenantId,
      collectorId: body.data.collectorId,
      requestedByUserId: session.id,
      durationSeconds: DISCOVERY_DURATION_SECONDS
    });
    if (result.status === 'collector_not_found') return reply.code(404).send({ error: 'collector_not_found' });
    if (result.status === 'active') {
      return reply.code(409).send({ error: 'discovery_already_running', session: result.session });
    }
    return reply.code(201).send({
      session: result.session,
      durationSeconds: DISCOVERY_DURATION_SECONDS,
      status: 'running'
    });
  });

  app.get('/v1/devices/discovery/:discoveryId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireAdmin(session, reply)) return;
    const params = discoveryIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_discovery_id' });
    const discovery = await dependencies.postgres.getDeviceDiscoverySession(session.tenantId, params.data.discoveryId);
    if (!discovery) return reply.code(404).send({ error: 'discovery_not_found' });
    const remainingSeconds = Math.max(0, Math.ceil((Date.parse(discovery.endsAt) - Date.now()) / 1000));
    if (remainingSeconds > 0) {
      return reply.send({ session: discovery, status: 'running', remainingSeconds, candidates: [] });
    }
    const [observations, registeredDevices] = await Promise.all([
      dependencies.clickhouse.discoverDevices({
        tenantId: session.tenantId,
        collectorId: discovery.collectorId,
        from: discovery.startedAt,
        to: discovery.endsAt
      }),
      dependencies.postgres.listDevices(session.tenantId)
    ]);
    const candidates = buildDeviceDiscoveryCandidates(observations, registeredDevices);
    return reply.send({
      session: discovery,
      status: 'completed',
      remainingSeconds: 0,
      candidates
    });
  });

  app.get('/v1/devices/status', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    const platformScope = session.context === 'platform';
    const [devices, activityRows, plan] = await Promise.all([
      platformScope ? dependencies.postgres.listPlatformDevices() : dependencies.postgres.listDevices(session.tenantId),
      dependencies.clickhouse.getDeviceActivity(platformScope ? null : session.tenantId),
      platformScope ? Promise.resolve(null) : dependencies.postgres.getTenantPlanUsage(session.tenantId)
    ]);
    const activity = new Map(activityRows.map((row) => [row.deviceId, row]));
    const nowMs = Date.now();
    const result = devices.map((device) => {
      const stats = activity.get(device.id);
      const lastReceivedAt = stats?.lastReceivedAt ?? null;
      return {
        ...device,
        status: device.enabled ? deviceFreshnessStatus(lastReceivedAt, nowMs) : 'disabled',
        lastReceivedAt,
        rawRecords24h: stats?.rawRecords24h ?? 0,
        events24h: stats?.events24h ?? 0,
        parseFailures24h: stats?.parseFailures24h ?? 0
      };
    });
    return reply.send({
      scope: platformScope ? 'platform' : 'tenant',
      generatedAt: new Date(nowMs).toISOString(),
      summary: {
        total: result.length,
        receiving: result.filter((device) => device.status === 'receiving').length,
        attention: result.filter((device) => !['receiving', 'disabled'].includes(device.status)).length,
        clients: platformScope
          ? new Set(result.map((device) => 'tenantId' in device ? device.tenantId : '')).size
          : 1
      },
      plan,
      devices: result
    });
  });

  app.post('/v1/devices', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireAdmin(session, reply)) return;
    const parsed = deviceBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_device', details: parsed.error.flatten() });
    try {
      const result = await dependencies.postgres.createManagedDevice({
        tenantId: session.tenantId,
        actorUserId: session.id,
        ...parsed.data
      });
      if (result.status === 'collector_not_found') return reply.code(404).send({ error: 'collector_not_found' });
      if (result.status === 'device_limit_reached') {
        return reply.code(409).send({ error: 'device_limit_reached', plan: result.usage });
      }
      return reply.code(201).send({ device: result.device });
    } catch (error) {
      if (postgresErrorCode(error) === '23505') return reply.code(409).send({ error: 'exporter_ip_already_exists' });
      throw error;
    }
  });

  app.put('/v1/devices/:deviceId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireAdmin(session, reply)) return;
    const params = deviceIdSchema.safeParse(request.params);
    const body = deviceBodySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_device_update' });
    try {
      const device = await dependencies.postgres.updateManagedDevice({
        tenantId: session.tenantId,
        actorUserId: session.id,
        deviceId: params.data.deviceId,
        ...body.data
      });
      if (!device) return reply.code(404).send({ error: 'device_or_collector_not_found' });
      return reply.send({ device });
    } catch (error) {
      if (postgresErrorCode(error) === '23505') return reply.code(409).send({ error: 'exporter_ip_already_exists' });
      throw error;
    }
  });

  app.delete('/v1/devices/:deviceId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireAdmin(session, reply)) return;
    const params = deviceIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_device_id' });
    const deleted = await dependencies.postgres.softDeleteManagedDevice({
      tenantId: session.tenantId,
      actorUserId: session.id,
      deviceId: params.data.deviceId
    });
    if (!deleted) return reply.code(404).send({ error: 'device_not_found' });
    return reply.send({ status: 'deleted', collectorUpdateWithinSeconds: 10 });
  });
}
