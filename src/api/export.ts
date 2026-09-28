import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchDateTimeToUtc } from '../core/timezone.js';
import { authenticateRequest } from './auth.js';
import type { ClickHouseRepository } from './clickhouse.js';
import type { PostgresRepository } from './postgres.js';
import { buildCsv, buildPdf, reportHash } from './report.js';

const exportSchema = z.object({
  publicIp: z.string().ip({ version: 'v4' }),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/),
  timezone: z.string().min(1).max(100),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  protocol: z.coerce.number().int().min(0).max(255).optional(),
  format: z.enum(['csv', 'pdf'])
});

export function registerExportRoutes(
  app: FastifyInstance,
  dependencies: { postgres: PostgresRepository; clickhouse: ClickHouseRepository }
): void {
  app.get('/v1/cgnat/export', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    const parsed = exportSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_export', details: parsed.error.flatten() });
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
    const durationMs = Math.max(0, Math.round(performance.now() - searchStartedAt));
    const auditId = await dependencies.postgres.auditQuery({
      tenantId: session.tenantId,
      userId: session.id,
      publicIp: query.publicIp,
      searchedAt: searchedAtUtc,
      port: query.port ?? null,
      protocol: query.protocol ?? null,
      erpRequested: false,
      resultCount: rows.length,
      requestId,
      durationMs
    });
    const reportInput = {
      publicIp: query.publicIp,
      searchedAt: searchedAtUtc,
      searchedAtLocal: query.at,
      searchedTimezone: query.timezone,
      port: query.port ?? null,
      protocol: query.protocol ?? null,
      auditId,
      rows
    };
    const report = query.format === 'csv' ? buildCsv(reportInput) : buildPdf(reportInput);
    await dependencies.postgres.auditExport({
      tenantId: session.tenantId,
      userId: session.id,
      queryAuditId: auditId,
      format: query.format,
      sha256: reportHash(report)
    });
    reply.header('content-disposition', `attachment; filename="consulta-cgnat-${auditId}.${query.format}"`);
    reply.type(query.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf');
    return reply.send(report);
  });
}
