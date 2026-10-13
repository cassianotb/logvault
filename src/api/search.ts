import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchDateTimeToUtc } from '../core/timezone.js';
import { authenticateRequest } from './auth.js';
import type { ClickHouseRepository } from './clickhouse.js';
import type { PostgresRepository } from './postgres.js';
import type { SubscriberResolver } from './subscribers.js';

const searchSchema = z.object({
  publicIp: z.string().ip({ version: 'v4' }),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/),
  timezone: z.string().min(1).max(100),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  protocol: z.coerce.number().int().min(0).max(255).optional(),
  correlateErp: z.enum(['true', 'false']).default('true').transform((value) => value === 'true')
});
const cycleParamsSchema = z.object({ eventId: z.string().uuid() });

export function registerSearchRoutes(
  app: FastifyInstance,
  dependencies: { postgres: PostgresRepository; clickhouse: ClickHouseRepository; subscriberResolver?: SubscriberResolver }
): void {
  app.get('/v1/cgnat/events/:eventId/cycle', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    const parsed = cycleParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_event_id' });
    const cycle = await dependencies.clickhouse.getAllocationCycle({
      tenantId: session.tenantId,
      eventId: parsed.data.eventId
    });
    if (!cycle) return reply.code(404).send({ error: 'allocation_event_not_found' });
    return reply.header('Cache-Control', 'no-store').send({ cycle });
  });

  app.get('/v1/cgnat/search', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    const parsed = searchSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_query', details: parsed.error.flatten() });
    const query = parsed.data;
    let searchedAtUtc: string;
    try {
      searchedAtUtc = searchDateTimeToUtc(query.at, query.timezone, session.tenantTimezone);
    } catch (error) {
      return reply.code(400).send({
        error: 'invalid_search_timezone',
        message: error instanceof Error ? error.message : 'Fuso horário inválido'
      });
    }
    const requestId = randomUUID();
    const searchStartedAt = performance.now();
    const rows = await dependencies.clickhouse.search({
      tenantId: session.tenantId,
      publicIp: query.publicIp,
      at: searchedAtUtc,
      port: query.port ?? null,
      protocol: query.protocol ?? null
    });
    let erp: { status: string; provider?: string; message?: string } = query.correlateErp
      ? { status: 'not_configured' }
      : { status: 'not_requested' };
    let enrichedRows = rows;
    if (query.correlateErp && dependencies.subscriberResolver && rows.length) {
      const resolution = await dependencies.subscriberResolver({
        tenantId: session.tenantId,
        privateIps: rows.map((row) => row.privateIp),
        at: searchedAtUtc,
        timezone: session.tenantTimezone
      });
      erp = { status: resolution.status, provider: resolution.provider };
      if (resolution.message) erp.message = resolution.message;
      enrichedRows = rows.map((row) => ({
        ...row,
        subscriber: resolution.subscribers.get(row.privateIp) ?? { status: 'not_found', provider: resolution.provider }
      }));
    }
    const durationMs = Math.max(0, Math.round(performance.now() - searchStartedAt));
    const auditId = await dependencies.postgres.auditQuery({
      tenantId: session.tenantId,
      userId: session.id,
      publicIp: query.publicIp,
      searchedAt: searchedAtUtc,
      port: query.port ?? null,
      protocol: query.protocol ?? null,
      erpRequested: query.correlateErp,
      resultCount: rows.length,
      requestId,
      durationMs
    });
    return reply.send({
      requestId,
      auditId,
      query: { atLocal: query.at, timezone: query.timezone, atUtc: searchedAtUtc },
      scope: query.port === undefined ? 'broad' : 'port',
      unequivocal: query.port !== undefined && rows.length === 1 && rows[0]?.exactPortMatch === true,
      erp,
      results: enrichedRows
    });
  });
}
