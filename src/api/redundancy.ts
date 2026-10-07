import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sha256 } from '../core/crypto.js';
import type { HostMetrics } from '../core/host-metrics.js';
import { authenticateRequest } from './auth.js';
import { requirePlatformAccess } from './access-control.js';
import type {
  AuthSession,
  PostgresRepository,
  RedundancyConfigurationSnapshot,
  RedundancyMode
} from './postgres.js';

const siteFields = {
  siteName: z.string().trim().min(2).max(100),
  publicUrl: z.string().trim().url().max(2048)
};
const siteSchema = z.object(siteFields).refine((value) => !new URL(value.publicUrl).username && !new URL(value.publicUrl).password, {
  message: 'A URL pública não pode conter credenciais', path: ['publicUrl']
});

const enrollSchema = z.object({ ...siteFields, enrollmentToken: z.string().min(32).max(512) })
  .refine((value) => !new URL(value.publicUrl).username && !new URL(value.publicUrl).password, {
    message: 'A URL pública não pode conter credenciais', path: ['publicUrl']
  });
const hostMetricsSchema = z.object({
  hostname: z.string().max(255), platform: z.string().max(255),
  uptimeSeconds: z.number().nonnegative(), cpuUsagePercent: z.number().min(0).max(100).nullable(),
  memoryTotalBytes: z.number().nonnegative(), memoryUsedBytes: z.number().nonnegative(),
  diskTotalBytes: z.number().nonnegative().nullable(), diskUsedBytes: z.number().nonnegative().nullable(),
  networkReceivedBytesPerSecond: z.number().nonnegative().nullable().optional(),
  networkTransmittedBytesPerSecond: z.number().nonnegative().nullable().optional()
});
const heartbeatSchema = z.object({
  siteId: z.string().uuid(),
  version: z.string().trim().min(1).max(100),
  serverName: z.string().trim().min(1).max(120),
  sampledAt: z.string().datetime({ offset: true }),
  metrics: hostMetricsSchema
});
const promotionSchema = z.object({
  confirmation: z.literal('PROMOVER STANDBY'),
  primaryIsolated: z.literal(true)
});
const siteIdSchema = z.object({ siteId: z.string().uuid() });
const timestampSchema = z.string().datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();
const redundancySnapshotSchema = z.object({
  generatedAt: timestampSchema,
  authorityEpoch: z.number().int().positive(),
  configurationRevision: z.number().int().positive(),
  peerTelemetry: z.object({
    serverName: z.string().trim().min(1).max(120), version: z.string().trim().min(1).max(100),
    sampledAt: timestampSchema, metrics: hostMetricsSchema
  }).optional(),
  tenants: z.array(z.object({
    id: z.string().uuid(), name: z.string(), timezone: z.string(), active: z.boolean(),
    tenantKind: z.string(), createdAt: timestampSchema
  })).max(10000),
  users: z.array(z.object({
    id: z.string().uuid(), tenantId: z.string().uuid(), name: z.string(), email: z.string(),
    passwordHash: z.string(), role: z.enum(['admin', 'operator', 'auditor']), active: z.boolean(),
    createdAt: timestampSchema, lastLoginAt: nullableTimestampSchema,
    updatedAt: timestampSchema, deletedAt: nullableTimestampSchema
  })).max(100000),
  servicePlans: z.array(z.object({
    id: z.string().uuid(), code: z.string(), name: z.string(), maxDevices: z.number().int().nullable(),
    active: z.boolean(), sortOrder: z.number().int(), createdAt: timestampSchema, updatedAt: timestampSchema
  })).max(1000),
  tenantPlanAssignments: z.array(z.object({
    tenantId: z.string().uuid(), planCode: z.string(), deviceLimitOverride: z.number().int().nullable(),
    assignedAt: timestampSchema, updatedAt: timestampSchema
  })).max(10000),
  companyProfiles: z.array(z.object({
    tenantId: z.string().uuid(), legalName: z.string(), tradeName: z.string(), cnpj: z.string(),
    phone: z.string(), email: z.string(), postalCode: z.string(), street: z.string(),
    addressNumber: z.string(), complement: z.string(), district: z.string(), city: z.string(),
    state: z.string(), logoData: z.string().nullable(), logoMime: z.string().nullable(), updatedAt: timestampSchema
  })).max(10000),
  collectors: z.array(z.object({
    id: z.string().uuid(), tenantId: z.string().uuid(), name: z.string(), mode: z.enum(['edge', 'cloud']),
    apiKeyHash: z.string(), status: z.string(), version: z.string().nullable(), lastSeenAt: nullableTimestampSchema,
    createdAt: timestampSchema, updatedAt: timestampSchema, deletedAt: nullableTimestampSchema,
    netflowPort: z.number().int().nullable(), syslogPort: z.number().int().nullable(),
    secondaryNetflowPort: z.number().int().nullable(), secondarySyslogPort: z.number().int().nullable()
  })).max(10000),
  devices: z.array(z.object({
    id: z.string().uuid(), tenantId: z.string().uuid(), collectorId: z.string().uuid().nullable(),
    name: z.string(), vendor: z.string(), model: z.string().nullable(), managementIp: z.string().nullable(),
    exporterIp: z.string(), timezone: z.string(), enabled: z.boolean(), settings: z.record(z.unknown()),
    createdAt: timestampSchema, deletedAt: nullableTimestampSchema
  })).max(100000),
  firewallPolicies: z.array(z.object({
    collectorId: z.string().uuid(), tenantId: z.string().uuid(), mode: z.enum(['monitor', 'enforce']),
    createdAt: timestampSchema, updatedAt: timestampSchema
  })).max(10000),
  firewallAuthorizations: z.array(z.object({
    id: z.string().uuid(), collectorId: z.string().uuid(), tenantId: z.string().uuid(),
    sourceCidr: z.string(), description: z.string(), createdAt: timestampSchema
  })).max(100000)
});

function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice(7).trim();
  return token && token.length <= 4096 ? token : undefined;
}

async function platformAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  postgres: PostgresRepository,
  level: 'view' | 'manage'
): Promise<AuthSession | null> {
  const session = await authenticateRequest(request, reply, postgres, { allowPlatformContext: true });
  if (!session) return null;
  if (session.context !== 'platform') {
    void reply.code(403).send({ error: 'platform_context_required' });
    return null;
  }
  return requirePlatformAccess(session, reply, 'continuity', level) ? session : null;
}

export function registerRedundancyRoutes(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository;
  applicationVersion: string;
  publicUrl: string;
  serverName: string;
  localTelemetryProvider: () => { metrics: HostMetrics; sampledAt: string };
  onSiteHeartbeat?: (input: { siteId: string; serverName: string; metrics: HostMetrics; sampledAt: string }) => Promise<void>;
  onModeChanged?: (mode: RedundancyMode) => void;
}): void {
  app.get('/v1/redundancy/status', async (request, reply) => {
    if (!await platformAdmin(request, reply, dependencies.postgres, 'view')) return;
    const [settings, sites] = await Promise.all([
      dependencies.postgres.getRedundancySettings(),
      dependencies.postgres.listRedundancySites()
    ]);
    return reply.send({
      ...settings,
      serverName: dependencies.serverName,
      sites: sites.filter((site) => site.status !== 'revoked').map((site) => ({
        ...site,
        status: site.status === 'active' && (!site.lastSeenAt || Date.now() - new Date(site.lastSeenAt).getTime() > 120_000)
          ? 'offline' : site.status
      })),
      administrationReadOnly: settings.mode === 'secondary',
      ingestionActive: true
    });
  });

  app.put('/v1/redundancy/primary', async (request, reply) => {
    const session = await platformAdmin(request, reply, dependencies.postgres, 'manage');
    if (!session) return;
    const parsed = siteSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_primary_site', details: parsed.error.flatten() });
    try {
      const settings = await dependencies.postgres.configureRedundancyPrimary({
        actorUserId: session.id, ...parsed.data
      });
      dependencies.onModeChanged?.(settings.mode);
      return reply.send({ settings });
    } catch (error) {
      if (error instanceof Error && error.message === 'redundancy_secondary_required') {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post('/v1/redundancy/enrollments', async (request, reply) => {
    const session = await platformAdmin(request, reply, dependencies.postgres, 'manage');
    if (!session) return;
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    try {
      const enrollment = await dependencies.postgres.createRedundancyEnrollment({
        actorUserId: session.id, tokenHash: sha256(token), expiresAt
      });
      return reply.code(201).send({ ...enrollment, token, expiresInMinutes: 30 });
    } catch (error) {
      if (error instanceof Error && ['redundancy_primary_required', 'redundancy_secondary_already_exists'].includes(error.message)) {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post('/v1/redundancy/enroll', async (request, reply) => {
    const parsed = enrollSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_redundancy_enrollment' });
    const siteToken = randomBytes(32).toString('base64url');
    let result;
    try {
      result = await dependencies.postgres.consumeRedundancyEnrollment({
        enrollmentTokenHash: sha256(parsed.data.enrollmentToken),
        siteTokenHash: sha256(siteToken), siteName: parsed.data.siteName, publicUrl: parsed.data.publicUrl
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'redundancy_secondary_already_exists') {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
    if (result.status === 'invalid') return reply.code(401).send({ error: 'invalid_or_expired_enrollment' });
    const snapshot = await dependencies.postgres.exportRedundancyConfiguration();
    return reply.send({
      status: 'enrolled', siteId: result.siteId, siteToken,
      role: 'secondary', primarySiteId: result.settings.siteId,
      primaryUrl: result.settings.publicUrl || dependencies.publicUrl,
      authorityEpoch: result.settings.authorityEpoch, snapshot
    });
  });

  const authenticateSite = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = bearerToken(request);
    const site = token ? await dependencies.postgres.findRedundancySiteByTokenHash(sha256(token)) : undefined;
    if (!site) void reply.code(401).send({ error: 'invalid_redundancy_site_token' });
    return site;
  };

  app.get('/v1/redundancy/configuration', async (request, reply) => {
    const site = await authenticateSite(request, reply);
    if (!site) return;
    await dependencies.postgres.touchRedundancySite(site.id, site.version || 'sync');
    const snapshot = await dependencies.postgres.exportRedundancyConfiguration();
    const telemetry = dependencies.localTelemetryProvider();
    return reply.send({
      ...snapshot,
      peerTelemetry: {
        serverName: dependencies.serverName, version: dependencies.applicationVersion,
        sampledAt: telemetry.sampledAt, metrics: telemetry.metrics
      }
    });
  });

  app.post('/v1/redundancy/heartbeat', async (request, reply) => {
    const site = await authenticateSite(request, reply);
    if (!site) return;
    const parsed = heartbeatSchema.safeParse(request.body);
    if (!parsed.success || parsed.data.siteId !== site.id) {
      return reply.code(403).send({ error: 'redundancy_site_identity_mismatch' });
    }
    await dependencies.postgres.touchRedundancySite(site.id, parsed.data.version, parsed.data.serverName);
    await dependencies.onSiteHeartbeat?.({
      siteId: site.id, serverName: parsed.data.serverName,
      metrics: parsed.data.metrics, sampledAt: parsed.data.sampledAt
    });
    return reply.send({ status: 'recorded', receivedAt: new Date().toISOString() });
  });

  app.post('/v1/redundancy/promote', async (request, reply) => {
    const session = await platformAdmin(request, reply, dependencies.postgres, 'manage');
    if (!session) return;
    const parsed = promotionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'promotion_confirmation_required' });
    try {
      const settings = await dependencies.postgres.promoteRedundancySecondary(session.id);
      dependencies.onModeChanged?.(settings.mode);
      return reply.send({ status: 'promoted', settings, warning: 'O servidor principal anterior deve permanecer isolado até ser reintegrado como standby.' });
    } catch (error) {
      if (error instanceof Error && error.message === 'redundancy_secondary_required') {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
  });

  app.delete('/v1/redundancy/sites/:siteId', async (request, reply) => {
    const session = await platformAdmin(request, reply, dependencies.postgres, 'manage');
    if (!session) return;
    const params = siteIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_redundancy_site_id' });
    const settings = await dependencies.postgres.getRedundancySettings();
    if (settings.mode !== 'primary') return reply.code(409).send({ error: 'redundancy_primary_required' });
    const revoked = await dependencies.postgres.revokeRedundancySite(session.id, params.data.siteId);
    if (!revoked) return reply.code(404).send({ error: 'redundancy_site_not_found' });
    return reply.send({ status: 'revoked' });
  });

}

export function startRedundancyConfigurationSync(dependencies: {
  postgres: PostgresRepository;
  primaryUrl: string;
  siteId: string;
  siteToken: string;
  applicationVersion: string;
  serverName: string;
  metricsProvider: () => { metrics: HostMetrics; sampledAt: string };
  onPrimaryTelemetry?: (input: { serverName: string; version: string; metrics: HostMetrics; sampledAt: string }) => Promise<void>;
  intervalMs: number;
  onError?: (error: unknown) => void;
  fetchImpl?: typeof fetch;
}): () => void {
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const request = dependencies.fetchImpl ?? fetch;
      const response = await request(new URL('/api/v1/redundancy/configuration', dependencies.primaryUrl), {
        headers: { authorization: `Bearer ${dependencies.siteToken}`, accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new Error(`Sincronização de configuração recusada: HTTP ${response.status}`);
      const snapshot = redundancySnapshotSchema.parse(await response.json()) as RedundancyConfigurationSnapshot;
      await dependencies.postgres.applyRedundancyConfiguration(snapshot);
      if (snapshot.peerTelemetry) await dependencies.onPrimaryTelemetry?.(snapshot.peerTelemetry);
      const telemetry = dependencies.metricsProvider();
      const heartbeat = await request(new URL('/api/v1/redundancy/heartbeat', dependencies.primaryUrl), {
        method: 'POST',
        headers: { authorization: `Bearer ${dependencies.siteToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          siteId: dependencies.siteId, version: dependencies.applicationVersion,
          serverName: dependencies.serverName, sampledAt: telemetry.sampledAt, metrics: telemetry.metrics
        }),
        redirect: 'error', signal: AbortSignal.timeout(5_000)
      });
      if (!heartbeat.ok) throw new Error(`Heartbeat de alta disponibilidade recusado: HTTP ${heartbeat.status}`);
    } catch (error) {
      dependencies.onError?.(error);
    } finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => void tick(), dependencies.intervalMs);
  timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}
