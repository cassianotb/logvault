import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerIxcIntegrationRoutes } from '../src/api/ixc-integrations.js';
import type { AuthSession, ErpIntegrationRecord, PostgresRepository } from '../src/api/postgres.js';

const encryptionKey = 'x'.repeat(32);
const cookie = `argus_session=${'x'.repeat(32)}`;
const session: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010', id: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000001', tenantName: 'ISP Teste', tenantTimezone: 'America/Sao_Paulo',
  name: 'Administrador', email: 'admin@example.com', role: 'admin', platformAdmin: false,
  expiresAt: '2026-10-13T23:00:00.000Z'
};

function repository() {
  const records = new Map<string, ErpIntegrationRecord>();
  return {
    postgres: {
      findActiveSession: async () => session,
      isIntegrationProviderEnabled: async () => true,
      getErpIntegration: async (_tenantId: string, provider: string) => records.get(provider) ?? null,
      saveErpIntegration: async (input: Omit<ErpIntegrationRecord, 'createdAt'>) => {
        const saved = { ...input, createdAt: records.get(input.provider)?.createdAt ?? '2026-10-13T12:00:00.000Z' };
        records.set(input.provider, saved);
        return saved;
      },
      deleteErpIntegration: async (_tenantId: string, provider: string) => records.delete(provider)
    } as unknown as PostgresRepository,
    records
  };
}

describe('integração IXC', () => {
  it('protege o token, exige teste e ativa automaticamente na conclusão', async () => {
    const store = repository();
    const tester = vi.fn(async () => ({
      resources: ['radacct', 'radusuarios', 'cliente', 'cliente_contrato'].map((resource) => ({
        resource: resource as 'radacct' | 'radusuarios' | 'cliente' | 'cliente_contrato', status: 'success' as const
      }))
    }));
    const app = Fastify();
    registerIxcIntegrationRoutes(app, { postgres: store.postgres, encryptionKey, tester });

    const saved = await app.inject({
      method: 'PUT', url: '/v1/integrations/ixc', headers: { cookie },
      payload: { baseUrl: 'https://ixc.example.test/webservice/v1', token: '42:test-token', enabled: false }
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().integration).toMatchObject({ configured: true, enabled: false, tokenConfigured: true });
    expect(JSON.stringify(saved.json())).not.toContain('42:test-token');
    expect(store.records.get('ixc')?.secretRef).not.toContain('42:test-token');

    const premature = await app.inject({
      method: 'PUT', url: '/v1/integrations/ixc', headers: { cookie },
      payload: { baseUrl: 'https://ixc.example.test/webservice/v1', token: '', enabled: true }
    });
    expect(premature.statusCode).toBe(409);
    expect(premature.json()).toEqual({ error: 'ixc_test_required' });

    const tested = await app.inject({ method: 'POST', url: '/v1/integrations/ixc/test', headers: { cookie } });
    expect(tested.statusCode).toBe(200);
    expect(tested.json()).toMatchObject({ status: 'success', integration: { enabled: false } });
    expect(tester).toHaveBeenCalledWith(expect.objectContaining({ token: '42:test-token' }));

    const concluded = await app.inject({
      method: 'PUT', url: '/v1/integrations/ixc', headers: { cookie },
      payload: { baseUrl: 'https://ixc.example.test/webservice/v1', token: '', enabled: true }
    });
    expect(concluded.statusCode).toBe(200);
    expect(concluded.json().integration).toMatchObject({ enabled: true, tokenConfigured: true });
    await app.close();
  });

  it('não ativa o IXC quando a integração Elleven já está ativa', async () => {
    const store = repository();
    store.records.set('elleven', {
      tenantId: session.tenantId, provider: 'elleven', baseUrl: '', secretRef: '', settings: {}, enabled: true,
      createdAt: '2026-10-13T12:00:00.000Z'
    });
    const app = Fastify();
    registerIxcIntegrationRoutes(app, {
      postgres: store.postgres,
      encryptionKey,
      tester: async () => ({ resources: [{ resource: 'radacct', status: 'success' }] })
    });
    await app.inject({
      method: 'PUT', url: '/v1/integrations/ixc', headers: { cookie },
      payload: { baseUrl: 'https://ixc.example.test/webservice/v1', token: '42:test-token', enabled: false }
    });
    await app.inject({ method: 'POST', url: '/v1/integrations/ixc/test', headers: { cookie } });
    const response = await app.inject({
      method: 'PUT', url: '/v1/integrations/ixc', headers: { cookie },
      payload: { baseUrl: 'https://ixc.example.test/webservice/v1', token: '', enabled: true }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'another_integration_active' });
    await app.close();
  });
});
