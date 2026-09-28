import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerOfficialReportRoutes } from '../src/api/official-reports.js';
import type { ClickHouseRepository } from '../src/api/clickhouse.js';
import type { AuthSession, PostgresRepository } from '../src/api/postgres.js';

const session: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010',
  id: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000001',
  tenantName: 'ISP Exemplo',
  tenantTimezone: 'America/Sao_Paulo',
  name: 'Operador',
  email: 'operador@example.com',
  role: 'operator',
  platformAdmin: false,
  expiresAt: '2026-08-12T12:00:00.000Z'
};

const cgnat = {
  deviceId: '30000000-0000-4000-8000-000000000001',
  lastEventId: '40000000-0000-4000-8000-000000000001',
  publicIp: '198.51.100.14',
  privateIp: '100.65.170.202',
  protocol: 6,
  protocolName: 'TCP',
  portStart: 23040,
  portEnd: 23551,
  portMode: 'contiguous',
  portStep: null,
  lastEvent: 'allocated',
  lastEventAt: '2026-08-06T23:56:55.000Z',
  exactPortMatch: true
};

describe('solicitação de relatório para ofício', () => {
  it('enfileira somente o registro CGNAT confirmado pela auditoria', async () => {
    const calls: unknown[] = [];
    const repository = {
      findActiveSession: async () => session,
      getOfficialReportQueryAudit: async () => ({
        id: '50000000-0000-4000-8000-000000000001', tenantId: session.tenantId,
        publicIp: cgnat.publicIp, searchedAt: '2026-08-06T23:57:00.000Z', port: 23040, protocol: 6
      }),
      getCompanyProfile: async () => ({
        tenantId: session.tenantId, tenantName: session.tenantName, legalName: '', tradeName: '', cnpj: '',
        phone: '', email: '', postalCode: '', street: '', addressNumber: '', complement: '', district: '',
        city: '', state: '', logoConfigured: false, updatedAt: null
      }),
      getCompanyLogo: async () => null,
      createOfficialReportJob: async (input: unknown) => {
        calls.push(input);
        return '60000000-0000-4000-8000-000000000001';
      }
    } as unknown as PostgresRepository;
    const clickhouse = { search: async () => [cgnat] } as unknown as ClickHouseRepository;
    let triggers = 0;
    const app = Fastify();
    registerOfficialReportRoutes(app, { postgres: repository, clickhouse, trigger: () => { triggers += 1; } });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/cgnat/official-reports',
      headers: { cookie: `argus_session=${'x'.repeat(32)}`, 'content-type': 'application/json' },
      payload: {
        auditId: '50000000-0000-4000-8000-000000000001',
        lastEventId: cgnat.lastEventId,
        searchedAtLocal: '2026-08-06T20:57:00',
        searchedTimezone: 'America/Sao_Paulo'
      }
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ status: 'pending', subscriberStatus: 'erp_not_integrated' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ cgnat, queryAuditId: '50000000-0000-4000-8000-000000000001' });
    expect(triggers).toBe(1);
    await app.close();
  });

  it('permite somente ao administrador excluir um relatório pronto do próprio tenant', async () => {
    const deletions: unknown[] = [];
    const repository = {
      findActiveSession: async () => ({ ...session, role: 'admin' as const }),
      deleteReadyOfficialReport: async (input: unknown) => {
        deletions.push(input);
        return 'deleted' as const;
      }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerOfficialReportRoutes(app, {
      postgres: repository,
      clickhouse: {} as ClickHouseRepository
    });
    const reportId = '60000000-0000-4000-8000-000000000001';
    const response = await app.inject({
      method: 'DELETE', url: `/v1/cgnat/official-reports/${reportId}`,
      headers: { cookie: `argus_session=${'x'.repeat(32)}` }
    });
    expect(response.statusCode).toBe(204);
    expect(deletions[0]).toEqual({ tenantId: session.tenantId, reportId, actorUserId: session.id });
    await app.close();
  });

  it('bloqueia operador e recusa a exclusão de relatório ainda não pronto', async () => {
    const operatorApp = Fastify();
    registerOfficialReportRoutes(operatorApp, {
      postgres: { findActiveSession: async () => session } as unknown as PostgresRepository,
      clickhouse: {} as ClickHouseRepository
    });
    const reportId = '60000000-0000-4000-8000-000000000001';
    const denied = await operatorApp.inject({
      method: 'DELETE', url: `/v1/cgnat/official-reports/${reportId}`,
      headers: { cookie: `argus_session=${'x'.repeat(32)}` }
    });
    expect(denied.statusCode).toBe(403);
    await operatorApp.close();

    const pendingApp = Fastify();
    registerOfficialReportRoutes(pendingApp, {
      postgres: {
        findActiveSession: async () => ({ ...session, role: 'admin' as const }),
        deleteReadyOfficialReport: async () => 'not_ready' as const
      } as unknown as PostgresRepository,
      clickhouse: {} as ClickHouseRepository
    });
    const pending = await pendingApp.inject({
      method: 'DELETE', url: `/v1/cgnat/official-reports/${reportId}`,
      headers: { cookie: `argus_session=${'x'.repeat(32)}` }
    });
    expect(pending.statusCode).toBe(409);
    expect(pending.json()).toEqual({ error: 'official_report_not_ready_for_deletion' });
    await pendingApp.close();
  });
});
