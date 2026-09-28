import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { fullPlatformPermissions, hasPlatformAccess } from '../src/api/access-control.js';
import type { AuthSession, PostgresRepository } from '../src/api/postgres.js';
import { registerUserRoutes } from '../src/api/users.js';

const cookie = `argus_session=${'p'.repeat(32)}`;
const baseSession: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010',
  id: '10000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-0000-0000-000000000000',
  tenantName: 'LogVault Plataforma',
  tenantTimezone: 'America/Sao_Paulo',
  name: 'Operação',
  email: 'operacao@logvault.test',
  role: 'admin',
  platformAdmin: true,
  platformOwner: false,
  platformAccessProfileId: '20000000-0000-4000-8000-000000000001',
  platformAccessProfileName: 'Operação',
  platformPermissions: { ...fullPlatformPermissions, users: 'view' },
  context: 'platform',
  homeTenantId: '00000000-0000-0000-0000-000000000000',
  homeTenantName: 'LogVault Plataforma',
  homeTenantTimezone: 'America/Sao_Paulo',
  expiresAt: '2026-08-14T12:00:00.000Z'
};

describe('perfis de acesso da plataforma', () => {
  it('diferencia visualização de gerenciamento', () => {
    expect(hasPlatformAccess(baseSession, 'users', 'view')).toBe(true);
    expect(hasPlatformAccess(baseSession, 'users', 'manage')).toBe(false);
    expect(hasPlatformAccess({ ...baseSession, platformOwner: true }, 'users', 'manage')).toBe(true);
  });

  it('permite listar perfis e bloqueia alterações para acesso somente leitura', async () => {
    let created = false;
    const repository = {
      findActiveSession: async () => baseSession,
      listPlatformAccessProfiles: async () => [],
      createPlatformAccessProfile: async () => {
        created = true;
        throw new Error('não deveria ser chamado');
      }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerUserRoutes(app, { postgres: repository });

    const listed = await app.inject({ method: 'GET', url: '/v1/platform/access-profiles', headers: { cookie } });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({ profiles: [] });

    const denied = await app.inject({
      method: 'POST', url: '/v1/platform/access-profiles',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        name: 'NOC', description: '',
        permissions: { ...Object.fromEntries(Object.keys(fullPlatformPermissions).map((key) => [key, 'none'])), users: 'view' }
      }
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ error: 'platform_permission_required', module: 'users', level: 'manage' });
    expect(created).toBe(false);
    await app.close();
  });
});
