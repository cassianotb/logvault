import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { AuthSession, PostgresRepository } from '../src/api/postgres.js';
import { registerUserRoutes } from '../src/api/users.js';
import { verifyPassword } from '../src/core/password.js';

const adminSession: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010',
  id: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000001',
  tenantName: 'ISP Teste',
  name: 'Administrador',
  email: 'admin@example.com',
  role: 'admin',
  platformAdmin: false,
  expiresAt: '2026-08-08T18:00:00.000Z'
};
const targetId = '10000000-0000-4000-8000-000000000002';
const cookie = `argus_session=${'x'.repeat(32)}`;
const platformSession: AuthSession = {
  ...adminSession,
  tenantId: '00000000-0000-0000-0000-000000000000',
  tenantName: 'LogVault Plataforma',
  context: 'platform',
  homeTenantId: '00000000-0000-0000-0000-000000000000',
  homeTenantName: 'LogVault Plataforma',
  homeTenantTimezone: 'America/Sao_Paulo',
  platformAdmin: true
};

function fakeRepository(deleteResult: 'deleted' | 'not_found' | 'own_user' | 'last_admin') {
  const calls: unknown[] = [];
  const repository = {
    findActiveSession: async () => adminSession,
    deleteManagedUser: async (input: unknown) => {
      calls.push(input);
      return deleteResult;
    }
  } as unknown as PostgresRepository;
  return { repository, calls };
}

describe('exclusão de usuários', () => {
  it('impede excluir a própria conta antes de alterar o banco', async () => {
    const { repository, calls } = fakeRepository('deleted');
    const app = Fastify();
    registerUserRoutes(app, { postgres: repository });
    const response = await app.inject({ method: 'DELETE', url: `/v1/users/${adminSession.id}`, headers: { cookie } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'cannot_delete_own_user' });
    expect(calls).toHaveLength(0);
    await app.close();
  });

  it('protege o último administrador ativo', async () => {
    const { repository } = fakeRepository('last_admin');
    const app = Fastify();
    registerUserRoutes(app, { postgres: repository });
    const response = await app.inject({ method: 'DELETE', url: `/v1/users/${targetId}`, headers: { cookie } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'last_active_admin' });
    await app.close();
  });

  it('exclui outro usuário dentro do tenant autenticado', async () => {
    const { repository, calls } = fakeRepository('deleted');
    const app = Fastify();
    registerUserRoutes(app, { postgres: repository });
    const response = await app.inject({ method: 'DELETE', url: `/v1/users/${targetId}`, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'deleted' });
    expect(calls).toEqual([{
      tenantId: adminSession.tenantId,
      actorUserId: adminSession.id,
      targetUserId: targetId
    }]);
    await app.close();
  });
});

describe('redefinição de senha pelo cliente', () => {
  it('permite ao administrador redefinir a senha somente dentro do próprio tenant', async () => {
    const calls: unknown[] = [];
    const repository = {
      findActiveSession: async () => adminSession,
      resetPlatformTenantAdministratorPassword: async (input: unknown) => {
        calls.push(input);
        return 'updated';
      }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerUserRoutes(app, { postgres: repository });
    const response = await app.inject({
      method: 'POST', url: `/v1/users/${targetId}/reset-password`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { password: 'NovaSenhaCliente!2026' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'updated', sessionsRevoked: true });
    const reset = calls[0] as {
      tenantId: string; targetUserId: string; passwordHash: string; platformAudit: boolean;
    };
    expect(reset).toMatchObject({
      tenantId: adminSession.tenantId,
      targetUserId: targetId,
      platformAudit: false
    });
    expect(reset.passwordHash).not.toBe('NovaSenhaCliente!2026');
    expect(await verifyPassword('NovaSenhaCliente!2026', reset.passwordHash)).toBe(true);
    await app.close();
  });

  it('nega redefinição de senha para operador', async () => {
    const calls: unknown[] = [];
    const repository = {
      findActiveSession: async () => ({ ...adminSession, role: 'operator' }),
      resetPlatformTenantAdministratorPassword: async (input: unknown) => {
        calls.push(input);
        return 'updated';
      }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerUserRoutes(app, { postgres: repository });
    const response = await app.inject({
      method: 'POST', url: `/v1/users/${targetId}/reset-password`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { password: 'NovaSenhaCliente!2026' }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'administrator_required' });
    expect(calls).toHaveLength(0);
    await app.close();
  });
});

describe('usuários da plataforma', () => {
  it('lista as contas administrativas no contexto global', async () => {
    const listUsers = async (tenantId: string) => {
      expect(tenantId).toBe(platformSession.tenantId);
      return [];
    };
    const repository = {
      findActiveSession: async () => platformSession,
      listUsers
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerUserRoutes(app, { postgres: repository });

    const response = await app.inject({ method: 'GET', url: '/v1/users', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ users: [] });
    await app.close();
  });

  it('cria outra conta como administradora da plataforma', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const repository = {
      findActiveSession: async () => platformSession,
      createManagedUser: async (input: Record<string, unknown>) => {
        calls.push(input);
        return { id: targetId, name: input.name, email: input.email, role: input.role, active: true };
      }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerUserRoutes(app, { postgres: repository });

    const response = await app.inject({
      method: 'POST', url: '/v1/users', headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Operação LogVault', email: 'operacao@logvault.test', role: 'admin', password: 'SenhaForte!2026' }
    });

    expect(response.statusCode).toBe(201);
    expect(calls[0]).toMatchObject({
      tenantId: platformSession.tenantId,
      actorUserId: platformSession.id,
      role: 'admin',
      platformAudit: true,
      platformAdministrator: true
    });
    await app.close();
  });

  it('não permite criar operador com privilégios globais', async () => {
    const createManagedUser = async () => { throw new Error('não deveria ser chamado'); };
    const repository = {
      findActiveSession: async () => platformSession,
      createManagedUser
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerUserRoutes(app, { postgres: repository });

    const response = await app.inject({
      method: 'POST', url: '/v1/users', headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Operador', email: 'operador@argus.test', role: 'operator', password: 'SenhaForte!2026' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_platform_user_role' });
    await app.close();
  });
});
