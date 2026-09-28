import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from './auth.js';
import type { PostgresRepository } from './postgres.js';

const auditQuerySchema = z.object({
  category: z.enum(['all', 'search', 'export', 'auth', 'users', 'devices', 'collectors', 'firewall', 'backups']).default('all'),
  limit: z.coerce.number().int().min(20).max(500).default(100)
});

export function registerAuditRoutes(app: FastifyInstance, dependencies: { postgres: PostgresRepository }): void {
  app.get('/v1/audit/events', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    if (!['admin', 'auditor'].includes(session.role)) {
      return reply.code(403).send({ error: 'audit_access_required' });
    }
    const parsed = auditQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_audit_query' });
    return reply.send(await dependencies.postgres.listAuditTimeline({
      tenantId: session.tenantId,
      category: parsed.data.category,
      limit: parsed.data.limit
    }));
  });
}
