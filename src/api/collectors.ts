import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sha256 } from '../core/crypto.js';
import { authenticateRequest } from './auth.js';
import type { AuthSession, PostgresRepository } from './postgres.js';

export type CollectorConnectionStatus = 'connected' | 'delayed' | 'offline' | 'never' | 'disabled';

const collectorBodySchema = z.object({
  name: z.string().trim().min(2).max(200),
  mode: z.enum(['edge', 'cloud']),
  active: z.boolean().default(true)
});
const collectorIdSchema = z.object({ collectorId: z.string().uuid() });

function requireAdmin(session: AuthSession, reply: FastifyReply): boolean {
  if (session.role === 'admin') return true;
  void reply.code(403).send({ error: 'administrator_required' });
  return false;
}

export function newCollectorToken(): string {
  return randomBytes(32).toString('base64url');
}

export function collectorConnectionStatus(lastSeenAt: string | null, nowMs = Date.now()): CollectorConnectionStatus {
  if (!lastSeenAt) return 'never';
  const lastSeenMs = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(lastSeenMs)) return 'never';
  const ageSeconds = Math.max(0, (nowMs - lastSeenMs) / 1000);
  if (ageSeconds <= 30) return 'connected';
  if (ageSeconds <= 5 * 60) return 'delayed';
  return 'offline';
}

export function registerCollectorRoutes(
  app: FastifyInstance,
  dependencies: {
    postgres: PostgresRepository; cloudPortStart: number; cloudPortEnd: number;
    redundancyDestination?: () => Promise<{ publicUrl: string } | null>;
  }
): void {
  app.get('/v1/collectors/status', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    const nowMs = Date.now();
    const platformScope = session.context === 'platform';
    const collectors = (await dependencies.postgres.listCollectors(platformScope ? null : session.tenantId))
      .map((collector) => {
        const { tenantId, tenantName, ...details } = collector;
        return {
          ...details,
          ...(platformScope ? { tenantId, tenantName } : {}),
          connectionStatus: collector.configuredStatus === 'disabled'
            ? 'disabled' as const
            : collectorConnectionStatus(collector.lastSeenAt, nowMs)
        };
      });
    return reply.send({
      scope: platformScope ? 'platform' : 'tenant',
      generatedAt: new Date(nowMs).toISOString(),
      summary: {
        total: collectors.length,
        connected: collectors.filter((collector) => collector.connectionStatus === 'connected').length,
        cloudAvailable: !collectors.some((collector) => collector.mode === 'cloud'),
        pendingRecords: collectors.reduce((total, collector) => total + collector.pendingRecords, 0),
        spoolBytes: collectors.reduce((total, collector) => total + collector.spoolBytes, 0)
      },
      collectors
    });
  });

  app.post('/v1/collectors', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireAdmin(session, reply)) return;
    const parsed = collectorBodySchema.pick({ name: true, mode: true }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_collector', details: parsed.error.flatten() });
    const token = newCollectorToken();
    const result = await dependencies.postgres.createManagedCollector({
      tenantId: session.tenantId,
      actorUserId: session.id,
      name: parsed.data.name,
      mode: parsed.data.mode,
      tokenHash: sha256(token),
      cloudPortStart: dependencies.cloudPortStart,
      cloudPortEnd: dependencies.cloudPortEnd
    });
    if (result.status === 'cloud_collector_already_exists') {
      return reply.code(409).send({ error: 'cloud_collector_already_exists' });
    }
    if (result.status === 'cloud_port_capacity_exhausted') {
      return reply.code(503).send({ error: 'cloud_port_capacity_exhausted' });
    }
    const { collector } = result;
    const redundancy = collector.mode === 'edge' && dependencies.redundancyDestination
      ? await dependencies.redundancyDestination() : null;
    return reply.code(201).send({
      collector,
      managed: collector.mode === 'cloud',
      ingress: collector.mode === 'cloud'
        ? { netflowPort: collector.netflowPort, syslogPort: collector.syslogPort }
        : null,
      credentials: collector.mode === 'edge'
        ? { tenantId: session.tenantId, collectorId: collector.id, token, secondaryUrl: redundancy?.publicUrl ?? '' }
        : null
    });
  });

  app.put('/v1/collectors/:collectorId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireAdmin(session, reply)) return;
    const params = collectorIdSchema.safeParse(request.params);
    const body = collectorBodySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_collector_update' });
    const result = await dependencies.postgres.updateManagedCollector({
      tenantId: session.tenantId,
      actorUserId: session.id,
      collectorId: params.data.collectorId,
      ...body.data
    });
    if (result.status === 'not_found') return reply.code(404).send({ error: 'collector_not_found' });
    if (result.status === 'mode_immutable') return reply.code(409).send({ error: 'collector_mode_immutable' });
    return reply.send({ collector: result.collector });
  });

  app.post('/v1/collectors/:collectorId/rotate-credential', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireAdmin(session, reply)) return;
    const params = collectorIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_collector_id' });
    const collector = (await dependencies.postgres.listCollectors(session.tenantId))
      .find((candidate) => candidate.id === params.data.collectorId);
    if (!collector) return reply.code(404).send({ error: 'collector_not_found' });
    if (collector.mode === 'cloud') return reply.code(409).send({ error: 'managed_cloud_has_no_external_credential' });
    const token = newCollectorToken();
    const rotated = await dependencies.postgres.rotateCollectorCredential({
      tenantId: session.tenantId,
      actorUserId: session.id,
      collectorId: params.data.collectorId,
      tokenHash: sha256(token)
    });
    if (!rotated) return reply.code(404).send({ error: 'collector_not_found' });
    const redundancy = dependencies.redundancyDestination
      ? await dependencies.redundancyDestination() : null;
    return reply.send({
      credentials: {
        tenantId: session.tenantId, collectorId: params.data.collectorId, token,
        secondaryUrl: redundancy?.publicUrl ?? ''
      }
    });
  });

  app.delete('/v1/collectors/:collectorId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireAdmin(session, reply)) return;
    const params = collectorIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_collector_id' });
    const result = await dependencies.postgres.softDeleteManagedCollector({
      tenantId: session.tenantId,
      actorUserId: session.id,
      collectorId: params.data.collectorId
    });
    if (result === 'not_found') return reply.code(404).send({ error: 'collector_not_found' });
    if (result === 'has_devices') return reply.code(409).send({ error: 'collector_has_devices' });
    return reply.send({ status: 'deleted' });
  });
}
