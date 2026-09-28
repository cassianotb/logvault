import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerIntegrationRoutes } from '../src/api/integrations.js';
import type { AuthSession, ErpIntegrationRecord, PostgresRepository } from '../src/api/postgres.js';

const encryptionKey = 'i'.repeat(32);
const cookie = `argus_session=${'x'.repeat(32)}`;
const session: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010', id: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000001', tenantName: 'ISP Teste',
  name: 'Administrador', email: 'admin@example.com', role: 'admin', platformAdmin: false,
  expiresAt: '2026-08-11T00:00:00.000Z'
};

function repository() {
  let record: ErpIntegrationRecord | null = null;
  return {
    postgres: {
      findActiveSession: async () => session,
      isIntegrationProviderEnabled: async () => true,
      getErpIntegration: async () => record,
      saveErpIntegration: async (input: Omit<ErpIntegrationRecord, 'createdAt'>) => {
        record = { ...input, createdAt: record?.createdAt ?? '2026-08-11T15:00:00.000Z' };
        return record;
      },
      deleteErpIntegration: async () => {
        const deleted = Boolean(record);
        record = null;
        return deleted;
      }
    } as unknown as PostgresRepository,
    getRecord: () => record
  };
}

const payload = {
  enabled: true,
  radius: {
    accessMode: 'cloud', collectorId: null, host: 'radius.example.test', port: 5432,
    database: 'radius', schema: 'public', username: 'argus_readonly', password: 'radius-secret', sslMode: 'require'
  },
  voalleDatabase: {
    host: 'database.voalle.test', port: 5432, database: 'voalle', schema: 'public',
    username: 'argus_voalle_readonly', password: 'voalle-database-secret', sslMode: 'require'
  }
};

describe('integração Elleven/Voalle', () => {
  it('salva credenciais criptografadas e nunca devolve os segredos', async () => {
    const store = repository();
    const app = Fastify();
    registerIntegrationRoutes(app, { postgres: store.postgres, encryptionKey });
    const response = await app.inject({ method: 'PUT', url: '/v1/integrations/elleven', headers: { cookie }, payload });
    expect(response.statusCode).toBe(200);
    expect(response.json().integration).toMatchObject({
      enabled: true,
      radius: { host: 'radius.example.test', passwordConfigured: true },
      voalleDatabase: { host: 'database.voalle.test', passwordConfigured: true }
    });
    expect(JSON.stringify(response.json())).not.toContain('radius-secret');
    expect(JSON.stringify(response.json())).not.toContain('voalle-database-secret');
    expect(store.getRecord()?.secretRef).not.toContain('radius-secret');
    await app.close();
  });

  it('testa o segundo PostgreSQL que relaciona logins, clientes e contratos', async () => {
    const store = repository();
    const voalleDatabaseTester = vi.fn(async () => ({
      database: 'voalle', user: 'argus_voalle_readonly', serverVersion: '16.4',
      candidates: [{ schema: 'erp', table: 'contracts', columns: ['id', 'client_id', 'pppoe_login'] }]
    }));
    const app = Fastify();
    registerIntegrationRoutes(app, { postgres: store.postgres, encryptionKey, voalleDatabaseTester });
    await app.inject({ method: 'PUT', url: '/v1/integrations/elleven', headers: { cookie }, payload });
    const response = await app.inject({ method: 'POST', url: '/v1/integrations/elleven/test-voalle-database', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'success', candidates: [{ table: 'contracts' }] });
    expect(voalleDatabaseTester).toHaveBeenCalledWith(expect.objectContaining({
      password: 'voalle-database-secret', username: 'argus_voalle_readonly'
    }));
    expect(store.getRecord()?.settings).toMatchObject({ voalleDatabase: { lastTest: { status: 'success' } } });
    await app.close();
  });

  it('testa o PostgreSQL e guarda somente metadados do schema descoberto', async () => {
    const store = repository();
    const radiusTester = vi.fn(async () => ({
      database: 'radius', user: 'argus_readonly', serverVersion: '16.4',
      candidates: [{ schema: 'public', table: 'radacct', columns: ['username', 'framedipaddress', 'acctstarttime', 'acctstoptime'] }]
    }));
    const app = Fastify();
    registerIntegrationRoutes(app, { postgres: store.postgres, encryptionKey, radiusTester });
    await app.inject({ method: 'PUT', url: '/v1/integrations/elleven', headers: { cookie }, payload });
    const response = await app.inject({ method: 'POST', url: '/v1/integrations/elleven/test-radius', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'success', candidates: [{ table: 'radacct' }] });
    expect(radiusTester).toHaveBeenCalledWith(expect.objectContaining({ password: 'radius-secret', username: 'argus_readonly' }));
    expect(store.getRecord()?.settings).toMatchObject({ radius: { lastTest: { status: 'success' } } });
    await app.close();
  });

  it('impede operador de ler ou alterar as credenciais', async () => {
    const store = repository();
    const postgres = {
      ...store.postgres,
      findActiveSession: async () => ({ ...session, role: 'operator' })
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerIntegrationRoutes(app, { postgres, encryptionKey });
    const response = await app.inject({ method: 'GET', url: '/v1/integrations/elleven', headers: { cookie } });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('oculta e bloqueia a configuração quando o conector foi desativado pela plataforma', async () => {
    const store = repository();
    const postgres = {
      ...store.postgres,
      isIntegrationProviderEnabled: async () => false
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerIntegrationRoutes(app, { postgres, encryptionKey });

    const catalog = await app.inject({ method: 'GET', url: '/v1/integrations/catalog', headers: { cookie } });
    const configuration = await app.inject({ method: 'GET', url: '/v1/integrations/elleven', headers: { cookie } });

    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().providers[0]).toMatchObject({ provider: 'elleven', enabled: false });
    expect(configuration.statusCode).toBe(403);
    expect(configuration.json()).toEqual({ error: 'integration_provider_unavailable' });
    await app.close();
  });

  it('permite que a plataforma altere a disponibilidade do conector', async () => {
    let enabled = true;
    const platformSession = {
      ...session,
      context: 'platform' as const,
      platformAdmin: true,
      platformOwner: true,
      homeTenantId: session.tenantId,
      homeTenantName: session.tenantName,
      homeTenantTimezone: session.tenantTimezone
    };
    const postgres = {
      findActiveSession: async () => platformSession,
      listPlatformIntegrationProviders: async () => [{
        provider: 'elleven', enabled, configuredTenants: 2, enabledTenants: 1, updatedAt: null
      }],
      setPlatformIntegrationProvider: async (input: { enabled: boolean }) => {
        enabled = input.enabled;
        return { provider: 'elleven', enabled, configuredTenants: 2, enabledTenants: 1, updatedAt: '2026-08-13T18:00:00.000Z' };
      }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerIntegrationRoutes(app, { postgres, encryptionKey });

    const response = await app.inject({
      method: 'PUT', url: '/v1/platform/integrations/elleven', headers: { cookie }, payload: { enabled: false }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().provider).toMatchObject({ provider: 'elleven', enabled: false, configuredTenants: 2 });
    await app.close();
  });

  it('carrega configurações antigas que salvaram as colunas descobertas como texto', async () => {
    const legacyRecord: ErpIntegrationRecord = {
      tenantId: session.tenantId,
      provider: 'elleven',
      baseUrl: '',
      secretRef: '',
      enabled: false,
      createdAt: '2026-08-11T15:00:00.000Z',
      settings: {
        version: 1,
        radius: {
          candidates: [{
            schema: 'public', table: 'radacct',
            columns: '{username,framedipaddress,acctstarttime,acctstoptime}'
          }]
        }
      }
    };
    const postgres = {
      findActiveSession: async () => session,
      isIntegrationProviderEnabled: async () => true,
      getErpIntegration: async () => legacyRecord
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerIntegrationRoutes(app, { postgres, encryptionKey });

    const response = await app.inject({ method: 'GET', url: '/v1/integrations/elleven', headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.json().integration.radius.candidates[0].columns).toEqual([
      'username', 'framedipaddress', 'acctstarttime', 'acctstoptime'
    ]);
    await app.close();
  });

  it('exclui a integração e suas credenciais do tenant', async () => {
    const store = repository();
    const app = Fastify();
    registerIntegrationRoutes(app, { postgres: store.postgres, encryptionKey });
    await app.inject({ method: 'PUT', url: '/v1/integrations/elleven', headers: { cookie }, payload });
    const response = await app.inject({ method: 'DELETE', url: '/v1/integrations/elleven', headers: { cookie } });
    expect(response.statusCode).toBe(204);
    expect(store.getRecord()).toBeNull();
    await app.close();
  });
});
