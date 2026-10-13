import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sha256 } from '../core/crypto.js';
import { searchDateTimeToUtc } from '../core/timezone.js';
import { authenticateRequest } from './auth.js';
import type { ClickHouseRepository } from './clickhouse.js';
import { buildOfficialReportPdf } from './official-report-document.js';
import type { PostgresRepository } from './postgres.js';
import type { SubscriberResolver, SubscriberSnapshot } from './subscribers.js';

const createReportSchema = z.object({
  auditId: z.string().uuid(),
  lastEventId: z.string().uuid(),
  searchedAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/),
  searchedTimezone: z.string().min(1).max(100),
  referenceNumber: z.string().trim().max(120).default(''),
  requestingAuthority: z.string().trim().max(200).default(''),
  notes: z.string().trim().max(1500).default('')
});
const reportIdSchema = z.object({ reportId: z.string().uuid() });
const listSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

function requireAdministrator(role: string, reply: FastifyReply): boolean {
  if (role === 'admin') return true;
  void reply.code(403).send({ error: 'tenant_administrator_required' });
  return false;
}

export async function startOfficialReportProcessor(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository;
}): Promise<() => void> {
  let processing = false;
  let stopped = false;
  await dependencies.postgres.recoverInterruptedOfficialReports();
  const processQueue = async () => {
    if (processing || stopped) return;
    processing = true;
    try {
      while (!stopped) {
        const job = await dependencies.postgres.claimNextOfficialReport();
        if (!job) break;
        try {
          const pdf = await buildOfficialReportPdf(job);
          await dependencies.postgres.completeOfficialReport(job.id, pdf, sha256(pdf));
          app.log.info({ reportId: job.id, queryAuditId: job.queryAuditId }, 'Relatório para ofício concluído');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await dependencies.postgres.failOfficialReport(job.id, message);
          app.log.error({ reportId: job.id, error: message }, 'Falha ao gerar relatório para ofício');
        }
      }
    } finally {
      processing = false;
    }
  };
  const timer = setInterval(() => void processQueue(), 3000);
  timer.unref();
  app.addHook('onClose', async () => {
    stopped = true;
    clearInterval(timer);
  });
  void processQueue();
  return () => void processQueue();
}

export function registerOfficialReportRoutes(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository;
  clickhouse: ClickHouseRepository;
  subscriberResolver?: SubscriberResolver;
  trigger?: () => void;
}): void {
  app.post('/v1/cgnat/official-reports', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    const parsed = createReportSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_official_report', details: parsed.error.flatten() });
    const audit = await dependencies.postgres.getOfficialReportQueryAudit(session.tenantId, parsed.data.auditId);
    if (!audit) return reply.code(404).send({ error: 'query_audit_not_found' });
    let converted: string;
    try {
      converted = searchDateTimeToUtc(parsed.data.searchedAtLocal, parsed.data.searchedTimezone, session.tenantTimezone);
    } catch {
      return reply.code(400).send({ error: 'invalid_search_timezone' });
    }
    if (Math.abs(Date.parse(converted) - Date.parse(audit.searchedAt)) > 1000) {
      return reply.code(409).send({ error: 'query_time_mismatch' });
    }
    const rows = await dependencies.clickhouse.search({
      tenantId: session.tenantId,
      publicIp: audit.publicIp,
      at: audit.searchedAt,
      port: audit.port,
      protocol: audit.protocol
    });
    const selected = rows.find((row) => row.lastEventId === parsed.data.lastEventId);
    if (!selected) return reply.code(409).send({ error: 'selected_cgnat_record_not_found' });
    const allocationCycle = await dependencies.clickhouse.getAllocationCycle({
      tenantId: session.tenantId,
      eventId: selected.lastEventId
    });
    if (!allocationCycle) return reply.code(409).send({ error: 'selected_cgnat_cycle_not_found' });
    const [company, logo] = await Promise.all([
      dependencies.postgres.getCompanyProfile(session.tenantId),
      dependencies.postgres.getCompanyLogo(session.tenantId)
    ]);
    if (!company) return reply.code(404).send({ error: 'tenant_not_found' });
    let subscriber: SubscriberSnapshot = { status: 'erp_not_integrated' };
    if (dependencies.subscriberResolver) {
      const resolution = await dependencies.subscriberResolver({
        tenantId: session.tenantId,
        privateIps: [selected.privateIp],
        at: audit.searchedAt,
        timezone: session.tenantTimezone
      });
      if (resolution.status === 'success') {
        subscriber = resolution.subscribers.get(selected.privateIp) ?? { status: 'not_found', provider: resolution.provider };
      } else if (resolution.status === 'unavailable') {
        subscriber = { status: 'integration_unavailable', provider: resolution.provider };
      }
    }
    const reportId = await dependencies.postgres.createOfficialReportJob({
      tenantId: session.tenantId,
      requestedByUserId: session.id,
      queryAuditId: audit.id,
      selectedEventId: selected.lastEventId,
      request: {
        publicIp: audit.publicIp,
        searchedAtUtc: audit.searchedAt,
        searchedAtLocal: parsed.data.searchedAtLocal,
        searchedTimezone: parsed.data.searchedTimezone,
        port: audit.port,
        protocol: audit.protocol,
        referenceNumber: parsed.data.referenceNumber,
        requestingAuthority: parsed.data.requestingAuthority,
        notes: parsed.data.notes
      },
      cgnat: { ...selected, allocationCycle },
      company,
      logo,
      subscriber
    });
    dependencies.trigger?.();
    return reply.code(202).send({ reportId, status: 'pending', subscriberStatus: subscriber.status });
  });

  app.get('/v1/cgnat/official-reports', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_report_list' });
    return reply.send({ reports: await dependencies.postgres.listOfficialReportJobs(session.tenantId, parsed.data.limit) });
  });

  app.get('/v1/cgnat/official-reports/:reportId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    const params = reportIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_report_id' });
    const report = await dependencies.postgres.getOfficialReportJob(session.tenantId, params.data.reportId);
    if (!report) return reply.code(404).send({ error: 'official_report_not_found' });
    return reply.send({ report });
  });

  app.get('/v1/cgnat/official-reports/:reportId/download', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    const params = reportIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_report_id' });
    const report = await dependencies.postgres.getOfficialReportPdf(session.tenantId, params.data.reportId);
    if (!report) return reply.code(404).send({ error: 'official_report_not_ready' });
    reply.header('content-disposition', `attachment; filename="relatorio-oficio-cgnat-${params.data.reportId}.pdf"`);
    reply.header('x-argus-sha256', report.sha256);
    reply.type('application/pdf');
    return reply.send(report.pdf);
  });

  app.delete('/v1/cgnat/official-reports/:reportId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireAdministrator(session.role, reply)) return;
    const params = reportIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_report_id' });
    const status = await dependencies.postgres.deleteReadyOfficialReport({
      tenantId: session.tenantId,
      reportId: params.data.reportId,
      actorUserId: session.id
    });
    if (status === 'not_found') return reply.code(404).send({ error: 'official_report_not_found' });
    if (status === 'not_ready') return reply.code(409).send({ error: 'official_report_not_ready_for_deletion' });
    return reply.code(204).send();
  });
}
