import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildPlatformAuditCsv, registerPlatformRoutes } from '../src/api/platform.js';
import type { AuthSession, PlatformAuditEvent, PostgresRepository } from '../src/api/postgres.js';
import { verifyPassword } from '../src/core/password.js';

const session: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010',
  id: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000001',
  tenantName: 'ISP Plataforma',
  name: 'Administrador',
  email: 'admin@example.com',
  role: 'admin',
  platformAdmin: true,
  expiresAt: '2026-08-08T18:00:00.000Z'
};
const cookie = `argus_session=${'x'.repeat(32)}`;
const auditEvent: PlatformAuditEvent = {
  id: '40000000-0000-4000-8000-000000000001',
  targetTenantId: '30000000-0000-4000-8000-000000000001',
  targetTenantName: 'ISP Cliente',
  actorName: 'Administrador',
  actorEmail: 'admin@example.com',
  action: 'plan_changed',
  details: { previousPlanCode: 'device_1', planCode: 'device_3', deviceLimit: 3 },
  createdAt: '2026-08-07T19:00:00.000Z'
};

function fakeRepository(overrides: Record<string, unknown> = {}) {
  const calls: unknown[] = [];
  const repository = {
    findActiveSession: async () => session,
    listPlatformTenants: async () => [],
    listServicePlans: async () => [],
    listPlatformAuditEvents: async () => [auditEvent],
    getPlatformAuditSummary: async () => ({ events24h: 1, created24h: 0, planChanges24h: 1, accessChanges24h: 0, exports24h: 0 }),
    recordPlatformAuditExport: async (input: unknown) => { calls.push(input); },
    updatePlatformTenant: async (input: unknown) => {
      calls.push(input);
      return { status: 'updated' };
    },
    ...overrides
  } as unknown as PostgresRepository;
  return { repository, calls };
}

describe('gestão de clientes da plataforma', () => {
  it('nega acesso a um administrador comum do ISP', async () => {
    const { repository } = fakeRepository({
      findActiveSession: async () => ({ ...session, platformAdmin: false })
    });
    const app = Fastify();
    registerPlatformRoutes(app, { postgres: repository });
    const response = await app.inject({ method: 'GET', url: '/v1/platform/tenants', headers: { cookie } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'platform_administrator_required' });
    await app.close();
  });

  it('impede que o administrador desative o tenant da própria conta', async () => {
    const { repository, calls } = fakeRepository();
    const app = Fastify();
    registerPlatformRoutes(app, { postgres: repository });
    const response = await app.inject({
      method: 'PUT',
      url: `/v1/platform/tenants/${session.tenantId}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'ISP Plataforma', active: false, planCode: 'custom', deviceLimitOverride: null }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'cannot_deactivate_own_tenant' });
    expect(calls).toHaveLength(0);
    await app.close();
  });

  it('recusa reduzir o plano abaixo dos equipamentos já cadastrados', async () => {
    const { repository } = fakeRepository({
      updatePlatformTenant: async () => ({ status: 'limit_below_usage', devicesUsed: 3 })
    });
    const app = Fastify();
    registerPlatformRoutes(app, { postgres: repository });
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/platform/tenants/30000000-0000-4000-8000-000000000001',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'ISP Cliente', active: true, planCode: 'device_1', deviceLimitOverride: null }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'limit_below_usage', devicesUsed: 3 });
    await app.close();
  });

  it('atualiza os dados gerais e o fuso horário do cliente', async () => {
    const { repository, calls } = fakeRepository();
    const app = Fastify();
    registerPlatformRoutes(app, { postgres: repository });
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/platform/tenants/30000000-0000-4000-8000-000000000001',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        name: 'ISP Cliente Atualizado',
        timezone: 'America/Manaus',
        active: true,
        planCode: 'device_5',
        deviceLimitOverride: 8
      }
    });

    expect(response.statusCode).toBe(200);
    expect(calls[0]).toMatchObject({
      tenantId: '30000000-0000-4000-8000-000000000001',
      name: 'ISP Cliente Atualizado',
      timezone: 'America/Manaus',
      active: true,
      planCode: 'device_5',
      deviceLimitOverride: 8
    });
    await app.close();
  });

  it('recusa fuso horário inexistente na edição', async () => {
    const { repository, calls } = fakeRepository();
    const app = Fastify();
    registerPlatformRoutes(app, { postgres: repository });
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/platform/tenants/30000000-0000-4000-8000-000000000001',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        name: 'ISP Cliente', timezone: 'America/Inexistente', active: true,
        planCode: 'device_5', deviceLimitOverride: null
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_tenant_update' });
    expect(calls).toHaveLength(0);
    await app.close();
  });

  it('lista somente os administradores do cliente para redefinição de senha', async () => {
    const userBase = {
      active: true, lastLoginAt: null,
      createdAt: '2026-08-01T12:00:00.000Z', updatedAt: '2026-08-01T12:00:00.000Z'
    };
    const { repository } = fakeRepository({
      listUsers: async () => [
        { ...userBase, id: '40000000-0000-4000-8000-000000000001', name: 'Admin ISP', email: 'admin@isp.test', role: 'admin' },
        { ...userBase, id: '40000000-0000-4000-8000-000000000002', name: 'Operador ISP', email: 'noc@isp.test', role: 'operator' }
      ]
    });
    const app = Fastify();
    registerPlatformRoutes(app, { postgres: repository });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/platform/tenants/30000000-0000-4000-8000-000000000001/administrators',
      headers: { cookie }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().administrators).toHaveLength(1);
    expect(response.json().administrators[0]).toMatchObject({ email: 'admin@isp.test', role: 'admin' });
    await app.close();
  });

  it('lista todos os usuários do cliente para a gestão separada', async () => {
    const userBase = {
      active: true, lastLoginAt: null,
      createdAt: '2026-08-01T12:00:00.000Z', updatedAt: '2026-08-01T12:00:00.000Z'
    };
    const users = [
      { ...userBase, id: '40000000-0000-4000-8000-000000000001', name: 'Admin ISP', email: 'admin@isp.test', role: 'admin' as const },
      { ...userBase, id: '40000000-0000-4000-8000-000000000002', name: 'Operador ISP', email: 'noc@isp.test', role: 'operator' as const }
    ];
    const { repository } = fakeRepository({ listUsers: async () => users });
    const app = Fastify();
    registerPlatformRoutes(app, { postgres: repository });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/platform/tenants/30000000-0000-4000-8000-000000000001/users',
      headers: { cookie }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().users).toHaveLength(2);
    expect(response.json().users.map((user: { role: string }) => user.role)).toEqual(['admin', 'operator']);
    await app.close();
  });

  it('cria usuário do cliente com senha criptografada e auditoria de plataforma', async () => {
    const { repository, calls } = fakeRepository({
      createManagedUser: async (input: unknown) => {
        calls.push(input);
        return {
          id: '40000000-0000-4000-8000-000000000003', name: 'Auditoria', email: 'auditoria@isp.test',
          role: 'auditor', active: true, lastLoginAt: null,
          createdAt: '2026-08-11T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z'
        };
      }
    });
    const app = Fastify();
    registerPlatformRoutes(app, { postgres: repository });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/platform/tenants/30000000-0000-4000-8000-000000000001/users',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Auditoria', email: 'AUDITORIA@ISP.TEST', role: 'auditor', password: 'SenhaInicialForte!2026' }
    });

    expect(response.statusCode).toBe(201);
    const created = calls[0] as { email: string; passwordHash: string; platformAudit: boolean };
    expect(created.email).toBe('auditoria@isp.test');
    expect(created.platformAudit).toBe(true);
    expect(created.passwordHash).not.toBe('SenhaInicialForte!2026');
    expect(await verifyPassword('SenhaInicialForte!2026', created.passwordHash)).toBe(true);
    await app.close();
  });

  it('edita e-mail, perfil e estado do usuário pelo administrador da plataforma', async () => {
    const { repository, calls } = fakeRepository({
      updateManagedUser: async (input: unknown) => {
        calls.push(input);
        return 'updated';
      }
    });
    const app = Fastify();
    registerPlatformRoutes(app, { postgres: repository });
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/platform/tenants/30000000-0000-4000-8000-000000000001/users/40000000-0000-4000-8000-000000000002',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Operação NOC', email: 'NOC@ISP.TEST', role: 'operator', active: false }
    });

    expect(response.statusCode).toBe(200);
    expect(calls[0]).toMatchObject({
      tenantId: '30000000-0000-4000-8000-000000000001',
      targetUserId: '40000000-0000-4000-8000-000000000002',
      name: 'Operação NOC', email: 'noc@isp.test', role: 'operator', active: false, platformAudit: true
    });
    await app.close();
  });

  it('exclui usuário do cliente preservando a operação auditável', async () => {
    const { repository, calls } = fakeRepository({
      deleteManagedUser: async (input: unknown) => {
        calls.push(input);
        return 'deleted';
      }
    });
    const app = Fastify();
    registerPlatformRoutes(app, { postgres: repository });
    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/platform/tenants/30000000-0000-4000-8000-000000000001/users/40000000-0000-4000-8000-000000000002',
      headers: { cookie }
    });

    expect(response.statusCode).toBe(200);
    expect(calls[0]).toMatchObject({
      tenantId: '30000000-0000-4000-8000-000000000001',
      targetUserId: '40000000-0000-4000-8000-000000000002',
      platformAudit: true
    });
    await app.close();
  });

  it('redefine a senha de qualquer usuário e envia somente o hash ao repositório', async () => {
    const { repository, calls } = fakeRepository({
      resetPlatformTenantAdministratorPassword: async (input: unknown) => {
        calls.push(input);
        return 'updated';
      }
    });
    const app = Fastify();
    registerPlatformRoutes(app, { postgres: repository });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/platform/tenants/30000000-0000-4000-8000-000000000001/users/40000000-0000-4000-8000-000000000001/reset-password',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { password: 'NovaSenhaForte!2026' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'updated', sessionsRevoked: true });
    const reset = calls[0] as { tenantId: string; targetUserId: string; passwordHash: string };
    expect(reset).toMatchObject({
      tenantId: '30000000-0000-4000-8000-000000000001',
      targetUserId: '40000000-0000-4000-8000-000000000001'
    });
    expect(reset.passwordHash).not.toBe('NovaSenhaForte!2026');
    expect(await verifyPassword('NovaSenhaForte!2026', reset.passwordHash)).toBe(true);
    await app.close();
  });

  it('impede excluir o tenant da própria conta', async () => {
    const { repository, calls } = fakeRepository({
      requestTenantDeletion: async (input: unknown) => {
        calls.push(input);
        return { status: 'queued', jobId: '50000000-0000-4000-8000-000000000001' };
      }
    });
    const app = Fastify();
    registerPlatformRoutes(app, { postgres: repository });
    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/platform/tenants/${session.tenantId}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { confirmation: session.tenantName, acknowledgeBackupRetention: true }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'cannot_delete_own_tenant' });
    expect(calls).toHaveLength(0);
    await app.close();
  });

  it('bloqueia a exclusão de um plano atribuído a clientes', async () => {
    const { repository } = fakeRepository({ deleteServicePlan: async () => 'plan_in_use' });
    const app = Fastify();
    registerPlatformRoutes(app, { postgres: repository });
    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/platform/plans/device_1',
      headers: { cookie }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'plan_in_use' });
    await app.close();
  });

  it('gera CSV da auditoria compatível com planilhas', () => {
    const report = buildPlatformAuditCsv([auditEvent]).toString('utf8');
    expect(report.startsWith('\ufeff"Data e horário";"Cliente"')).toBe(true);
    expect(report).toContain('"ISP Cliente";"Administrador";"admin@example.com";"plan_changed"');
    expect(report).toContain('"{""previousPlanCode"":""device_1""');
  });

  it('audita o download do histórico global', async () => {
    const { repository, calls } = fakeRepository();
    const app = Fastify();
    registerPlatformRoutes(app, { postgres: repository });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/platform/audit/export?action=plan_changed',
      headers: { cookie }
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      actorUserId: session.id,
      targetTenantId: null,
      resultCount: 1,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    await app.close();
  });
});
