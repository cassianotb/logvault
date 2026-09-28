import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerFirewallRoutes } from '../src/api/firewall.js';
import type { AuthSession, PostgresRepository } from '../src/api/postgres.js';

const cookie = `argus_session=${'x'.repeat(32)}`;
const tenantSession = {
  sessionId: '10000000-0000-4000-8000-000000000010',
  id: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000001',
  tenantName: 'ISP Teste', tenantTimezone: 'America/Sao_Paulo',
  homeTenantId: '20000000-0000-4000-8000-000000000001',
  homeTenantName: 'ISP Teste', homeTenantTimezone: 'America/Sao_Paulo',
  name: 'Administrador', email: 'admin@example.com', role: 'admin',
  platformAdmin: false, context: 'tenant', expiresAt: '2099-08-13T12:00:00.000Z'
} satisfies AuthSession;
const collectorId = '30000000-0000-4000-8000-000000000001';
const platformSession = {
  ...tenantSession,
  platformAdmin: true,
  platformOwner: true,
  context: 'platform'
} satisfies AuthSession;

describe('firewall de ingestão', () => {
  it('lista as políticas somente no escopo autenticado', async () => {
    const scopes: Array<string | null> = [];
    const postgres = {
      findActiveSession: async () => tenantSession,
      listFirewallCollectors: async (tenantId: string | null) => {
        scopes.push(tenantId);
        return [];
      }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerFirewallRoutes(app, { postgres });
    const response = await app.inject({ method: 'GET', url: '/v1/firewall', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(scopes).toEqual([tenantSession.tenantId]);
    expect(response.json().summary).toMatchObject({ cloudCollectors: 0, enforcing: 0, blockedPackets: 0 });
    await app.close();
  });

  it('normaliza uma origem detectada como autorização /32', async () => {
    const calls: unknown[] = [];
    const postgres = {
      findActiveSession: async () => tenantSession,
      createFirewallAuthorization: async (input: unknown) => {
        calls.push(input);
        return {
          status: 'created', tenantId: tenantSession.tenantId,
          authorization: { id: '40000000-0000-4000-8000-000000000001', sourceCidr: '203.0.113.8/32', description: '', createdAt: '2026-08-13T12:00:00.000Z' }
        };
      }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerFirewallRoutes(app, { postgres });
    const response = await app.inject({
      method: 'POST', url: `/v1/firewall/collectors/${collectorId}/authorizations`, headers: { cookie },
      payload: { sourceCidr: '203.0.113.8', description: '' }
    });
    expect(response.statusCode).toBe(201);
    expect(calls).toEqual([expect.objectContaining({
      collectorId, tenantId: tenantSession.tenantId, sourceCidr: '203.0.113.8/32'
    })]);
    await app.close();
  });

  it('não ativa proteção sem uma origem autorizada', async () => {
    const postgres = {
      findActiveSession: async () => tenantSession,
      updateFirewallPolicy: async () => ({ status: 'authorization_required' })
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerFirewallRoutes(app, { postgres });
    const response = await app.inject({
      method: 'PUT', url: `/v1/firewall/collectors/${collectorId}/policy`, headers: { cookie },
      payload: { mode: 'enforce' }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'firewall_authorization_required' });
    await app.close();
  });

  it('expõe o controle de Web e SSH somente no contexto da plataforma', async () => {
    const postgres = {
      findActiveSession: async () => platformSession,
      listFirewallCollectors: async () => [],
      listInfrastructureFirewallPolicies: async () => [{
        service: 'web', mode: 'open', port: 443,
        updatedAt: '2026-09-25T12:00:00.000Z', appliedMode: null,
        appliedPolicyUpdatedAt: null, appliedAt: null, authorizations: []
      }]
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerFirewallRoutes(app, { postgres });
    const response = await app.inject({ method: 'GET', url: '/v1/firewall', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().infrastructureAccess).toEqual([
      expect.objectContaining({ service: 'web', port: 443, applicationState: 'pending_host_agent' })
    ]);
    await app.close();
  });

  it('normaliza /32 ao autorizar uma origem administrativa', async () => {
    const calls: unknown[] = [];
    const postgres = {
      findActiveSession: async () => platformSession,
      createInfrastructureFirewallAuthorization: async (input: unknown) => {
        calls.push(input);
        return {
          status: 'created',
          authorization: {
            id: '40000000-0000-4000-8000-000000000002', sourceCidr: '198.51.100.14/32',
            description: 'VPN', createdAt: '2026-09-25T12:00:00.000Z'
          }
        };
      }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerFirewallRoutes(app, { postgres });
    const response = await app.inject({
      method: 'POST', url: '/v1/firewall/infrastructure/ssh/authorizations', headers: { cookie },
      payload: { sourceCidr: '198.51.100.14', description: 'VPN' }
    });
    expect(response.statusCode).toBe(201);
    expect(calls).toEqual([expect.objectContaining({ service: 'ssh', sourceCidr: '198.51.100.14/32' })]);
    await app.close();
  });

  it('não ativa allowlist administrativa sem uma origem autorizada', async () => {
    const postgres = {
      findActiveSession: async () => platformSession,
      updateInfrastructureFirewallPolicy: async () => ({ status: 'authorization_required' })
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerFirewallRoutes(app, { postgres });
    const response = await app.inject({
      method: 'PUT', url: '/v1/firewall/infrastructure/web/policy', headers: { cookie },
      payload: { mode: 'allowlist' }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'infrastructure_firewall_authorization_required' });
    await app.close();
  });

  it('edita manualmente uma regra administrativa', async () => {
    const authorizationId = '40000000-0000-4000-8000-000000000003';
    const calls: unknown[] = [];
    const postgres = {
      findActiveSession: async () => platformSession,
      updateInfrastructureFirewallAuthorization: async (input: unknown) => {
        calls.push(input);
        return {
          status: 'updated',
          authorization: {
            id: authorizationId, sourceCidr: '203.0.113.0/24',
            description: 'VPN administrativa', createdAt: '2026-09-25T12:00:00.000Z'
          }
        };
      }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerFirewallRoutes(app, { postgres });
    const response = await app.inject({
      method: 'PUT', url: `/v1/firewall/infrastructure/authorizations/${authorizationId}`,
      headers: { cookie },
      payload: { service: 'web', sourceCidr: '203.0.113.0/24', description: 'VPN administrativa' }
    });
    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([expect.objectContaining({
      authorizationId, service: 'web', sourceCidr: '203.0.113.0/24'
    })]);
    await app.close();
  });
});
