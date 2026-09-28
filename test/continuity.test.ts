import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { fullPlatformPermissions } from '../src/api/access-control.js';
import { ContinuityMonitor, registerContinuityRoutes, tryAutomaticContinuityActivation } from '../src/api/continuity.js';
import type { AuthSession, PlatformContinuitySettings, PostgresRepository } from '../src/api/postgres.js';
import { sealSecret } from '../src/core/secret-box.js';

const session: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010', id: '10000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-0000-0000-000000000000', tenantName: 'LogVault Plataforma',
  name: 'Admin', email: 'admin@example.com', role: 'admin', platformAdmin: true, platformOwner: false,
  platformPermissions: fullPlatformPermissions, context: 'platform', expiresAt: '2026-09-12T00:00:00.000Z'
};
const cookie = `argus_session=${'x'.repeat(32)}`;
const pgPrimary = { role: 'primary' as const, connectedStandbys: 1, primaryLsn: '0/10', receiveLsn: null, replayLsn: null, replayLagSeconds: 0.2 };
const pgStandby = { role: 'standby' as const, connectedStandbys: 0, primaryLsn: null, receiveLsn: '0/10', replayLsn: '0/10', replayLagSeconds: 0.4 };
const ch = { replicatedTables: 4, readonlyTables: 0, queueSize: 0, absoluteDelaySeconds: 0, activeReplicas: 2, totalReplicas: 2, sessionExpired: false, replicationMode: 'keeper' as const };

function monitor(overrides: Partial<ConstructorParameters<typeof ContinuityMonitor>[0]> = {}) {
  return new ContinuityMonitor({ enabled: true, siteAName: 'DC-A', siteBName: 'DC-B', warningSeconds: 10, criticalSeconds: 60,
    primaryPostgres: { getReplicationHealth: async () => pgPrimary }, standbyPostgres: { getReplicationHealth: async () => pgStandby },
    primaryClickhouse: { getReplicationHealth: async () => ch }, standbyClickhouse: { getReplicationHealth: async () => ch },
    standbyApiUrl: 'http://standby.test', fetchImpl: async () => new Response('{}', { status: 200 }), ...overrides });
}

describe('continuidade entre datacenters', () => {
  it('consolida uma topologia assíncrona pronta para failover', async () => {
    const snapshot = await monitor().snapshot();
    expect(snapshot).toMatchObject({ configured: true, phase: 'protected', status: 'healthy', failoverReady: true, estimatedRpoSeconds: 0.2 });
  });

  it('torna atraso e indisponibilidade visíveis sem lançar erro', async () => {
    const snapshot = await monitor({
      standbyPostgres: { getReplicationHealth: async () => ({ ...pgStandby, replayLagSeconds: 75 }) },
      fetchImpl: async () => { throw new Error('timeout'); }
    }).snapshot();
    expect(snapshot.status).toBe('critical');
    expect(snapshot.failoverReady).toBe(false);
    expect(snapshot.components.postgresStandby.status).toBe('critical');
    expect(snapshot.components.standbyApi.detail).toBe('timeout');
  });

  it('observa os componentes cadastrados antes de ativar a replicação real', async () => {
    const snapshot = await monitor({ enabled: false }).snapshot();
    expect(snapshot).toMatchObject({ configured: false, phase: 'preparing', status: 'disabled', failoverReady: false });
    expect(snapshot.components.postgresPrimary.status).toBe('healthy');
    expect(snapshot.components.postgresStandby.status).toBe('healthy');
    expect(snapshot.components.clickhouseStandby.status).toBe('healthy');
    expect(snapshot.components.standbyApi.status).toBe('healthy');
  });

  it('distingue ausência de cadastro de um DC-B em preparação', async () => {
    const snapshot = await monitor({ enabled: false, standbyPostgres: undefined, standbyClickhouse: undefined, standbyApiUrl: undefined }).snapshot();
    expect(snapshot).toMatchObject({ configured: false, phase: 'not_configured', status: 'disabled' });
  });

  it('ativa automaticamente somente depois de todas as validações passarem', async () => {
    const applied: boolean[] = [];
    let activated = false;
    const base = { enabled: false, siteAName: 'Matriz São Paulo', siteBName: 'DR Curitiba',
      postgresStandbyUrl: 'postgresql://monitor:secret@pg-b/argus', clickhouseStandbyUrl: 'https://ch-b.test',
      clickhouseStandbyUser: 'monitor', clickhouseStandbyPassword: 'secret', standbyApiUrl: 'https://api-b.test',
      warningSeconds: 10, criticalSeconds: 60 };
    const waiting = await tryAutomaticContinuityActivation({
      loadSettings: async () => base,
      testConfiguration: async () => monitor({ fetchImpl: async () => { throw new Error('indisponível'); } }).snapshot(),
      applyConfiguration: async () => { applied.push(true); },
      activateStoredSettings: async () => { activated = true; return true; }
    });
    expect(waiting).toBe('waiting');
    expect(applied).toHaveLength(0);
    expect(activated).toBe(false);

    const ready = await tryAutomaticContinuityActivation({
      loadSettings: async () => base,
      testConfiguration: async () => monitor().snapshot(),
      applyConfiguration: async (settings) => { applied.push(settings.enabled); },
      activateStoredSettings: async () => { activated = true; return true; }
    });
    expect(ready).toBe('activated');
    expect(applied).toEqual([true]);
    expect(activated).toBe(true);
  });

  it('restringe o endpoint ao contexto e à permissão da plataforma', async () => {
    const postgres = { findActiveSession: async () => session, getPlatformContinuitySettings: async () => null } as unknown as PostgresRepository;
    const app = Fastify();
    registerContinuityRoutes(app, { postgres, monitor: monitor() });
    const response = await app.inject({ method: 'GET', url: '/v1/continuity/status', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    const deniedRepo = { findActiveSession: async () => ({ ...session, platformPermissions: { ...fullPlatformPermissions, continuity: 'none' } }),
      getPlatformContinuitySettings: async () => null } as unknown as PostgresRepository;
    const deniedApp = Fastify();
    registerContinuityRoutes(deniedApp, { postgres: deniedRepo, monitor: monitor() });
    expect((await deniedApp.inject({ method: 'GET', url: '/v1/continuity/status', headers: { cookie } })).statusCode).toBe(403);
    await Promise.all([app.close(), deniedApp.close()]);
  });

  it('não expõe segredos e exige teste antes da ativação', async () => {
    const key = 'continuity-settings-encryption-key';
    const stored: PlatformContinuitySettings = {
      enabled: false, siteAName: 'DC-A', siteBName: 'DC-B',
      postgresStandbyUrlSecret: sealSecret('postgresql://monitor:secret@pg-b/argus', key),
      clickhouseStandbyUrl: 'https://ch-b.test', clickhouseStandbyUser: 'monitor',
      clickhouseStandbyPasswordSecret: sealSecret('ch-secret', key), standbyApiUrl: 'https://api-b.test',
      routing: { siteAHost: 'dc-a.internal', siteBHost: 'dc-b.internal', panelHost: 'argus.test',
        ingestHost: 'ingest.test', drControlHost: 'dr.test', dnsProvider: 'manual', dnsTtlSeconds: 300 },
      warningSeconds: 10, criticalSeconds: 60, lastTestAt: null, lastTestStatus: null,
      lastTestError: '', updatedAt: '2026-09-11T12:00:00.000Z'
    };
    const tests: unknown[] = [];
    const postgres = {
      findActiveSession: async () => session,
      getPlatformContinuitySettings: async () => stored,
      recordPlatformContinuityTest: async (input: unknown) => { tests.push(input); }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerContinuityRoutes(app, {
      postgres, monitor: monitor(), encryptionKey: key,
      fallbackSettings: { enabled: false, siteAName: 'A', siteBName: 'B', postgresStandbyUrl: '',
        clickhouseStandbyUrl: '', clickhouseStandbyUser: '', clickhouseStandbyPassword: '', standbyApiUrl: '',
        warningSeconds: 10, criticalSeconds: 60 },
      testConfiguration: async () => monitor().snapshot(), applyConfiguration: async () => undefined
    });
    const listed = await app.inject({ method: 'GET', url: '/v1/continuity/settings', headers: { cookie } });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().settings).toMatchObject({ postgresStandbyConfigured: true, clickhousePasswordConfigured: true });
    expect(JSON.stringify(listed.json())).not.toContain('secret');
    expect(listed.json().settings.routing).toMatchObject({ panelHost: 'argus.test', dnsTtlSeconds: 300 });

    const activation = await app.inject({ method: 'PUT', url: '/v1/continuity/settings', headers: { cookie }, payload: {
      enabled: true, siteAName: 'DC-A', siteBName: 'DC-B', postgresStandbyUrl: '',
      clickhouseStandbyUrl: 'https://ch-b.test', clickhouseStandbyUser: 'monitor', clickhouseStandbyPassword: '',
      standbyApiUrl: 'https://api-b.test', warningSeconds: 10, criticalSeconds: 60
    } });
    expect(activation.statusCode).toBe(409);
    expect(activation.json().error).toBe('continuity_test_required');

    const tested = await app.inject({ method: 'POST', url: '/v1/continuity/settings/test', headers: { cookie } });
    expect(tested.statusCode).toBe(200);
    expect(tests[0]).toMatchObject({ status: 'success' });
    await app.close();
  });

  it('gera token de uso único e recebe o inventário automaticamente', async () => {
    let tokenHash = '';
    let consumed = false;
    const applied: unknown[] = [];
    const postgres = {
      findActiveSession: async () => session,
      createContinuityEnrollment: async (input: { tokenHash: string; expiresAt: string }) => {
        tokenHash = input.tokenHash;
        return { id: '50000000-0000-4000-8000-000000000001', status: 'pending', expiresAt: input.expiresAt,
          createdAt: new Date().toISOString(), enrolledAt: null, inventory: null };
      },
      consumeContinuityEnrollment: async (input: { tokenHash: string }) => {
        if (consumed || input.tokenHash !== tokenHash) return 'invalid';
        consumed = true; return 'enrolled';
      }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerContinuityRoutes(app, {
      postgres, monitor: monitor(), encryptionKey: 'continuity-enrollment-encryption-key',
      fallbackSettings: { enabled: false, siteAName: 'A', siteBName: 'B', postgresStandbyUrl: '',
        clickhouseStandbyUrl: '', clickhouseStandbyUser: '', clickhouseStandbyPassword: '', standbyApiUrl: '',
        warningSeconds: 10, criticalSeconds: 60 },
      testConfiguration: async () => monitor().snapshot(),
      applyConfiguration: async (settings) => { applied.push(settings); },
      enrollmentPublicUrl: 'https://logvault.example.com',
      enrollmentTopology: {
        siteAHost: 'logvault-dca.example.com', panelHost: 'logvault.example.com', ingestHost: 'ingest.example.com',
        drControlHost: 'dr.example.com', dnsProvider: 'manual', dnsTtlSeconds: 120
      },
      provisioning: {
        repositoryUrl: 'https://github.com/example/logvault.git', repositoryRef: 'main',
        environment: { ARGUS_DR_POSTGRES_REPLICATION_PASSWORD: 'replication-secret' }
      }
    });
    const created = await app.inject({ method: 'POST', url: '/v1/continuity/enrollments', headers: { cookie },
      payload: { siteAName: 'Matriz São Paulo', siteBName: 'DR Curitiba',
        siteAHost: 'logvault-dca.example.com', siteBHost: 'logvault-dcb.example.com' } });
    expect(created.statusCode).toBe(201);
    const issued = created.json();
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{40,128}$/);
    expect(tokenHash).not.toBe(issued.token);
    expect(issued.command).toContain('install-dc-b.sh install --yes');
    expect(issued.command).toContain("--site-a-name 'Matriz São Paulo'");
    expect(issued.command).toContain("--site-b-name 'DR Curitiba'");
    expect(issued.command).toContain("--site-a-host 'logvault-dca.example.com'");
    expect(issued.command).toContain("--site-b-host 'logvault-dcb.example.com'");
    expect(issued.command).toContain("--ingest-host 'ingest.example.com'");
    expect(issued.command).toContain('--dns-ttl 120');
    expect(issued.command).not.toContain('IP_OU_DNS_PRIVADO');
    expect(issued.command).not.toContain('--allow-http');

    const payload = {
      inventory: { generatedAt: new Date().toISOString(), hostname: 'dc-b.internal', architecture: 'x86_64',
        operatingSystem: 'Debian 12', vcpu: 8, memoryGiB: 32, disksGiB: { system: 50, postgres: 100, clickhouse: 500 },
        docker: { engine: '27', compose: '2.30' }, ntpSynchronized: true,
        requirements: { minimumVcpu: 8 }, result: 'approved', failures: 0, warnings: 0 },
      configuration: { siteAName: 'DC-A', siteBName: 'DC-B',
        postgresStandbyUrl: 'postgresql://monitor:monitor-secret-2026@dc-b.internal:5432/argus',
        clickhouseStandbyUrl: 'https://dc-b.internal:8443', clickhouseStandbyUser: 'monitor',
        clickhouseStandbyPassword: 'secret', standbyApiUrl: 'https://dc-b.internal', warningSeconds: 10, criticalSeconds: 60 }
      , routing: { siteAHost: 'dc-a.internal', siteBHost: 'dc-b.internal', panelHost: 'logvault.example.test',
        ingestHost: 'ingest.example.test', drControlHost: 'dr.example.test', dnsProvider: 'manual', dnsTtlSeconds: 300 }
    };
    const enrolled = await app.inject({ method: 'POST', url: '/v1/continuity/enroll',
      headers: { authorization: `Bearer ${issued.token}`, 'content-type': 'application/json' }, payload });
    expect(enrolled.statusCode).toBe(201);
    expect(enrolled.json()).toMatchObject({
      status: 'enrolled', monitoringEnabled: false,
      provisioning: { repositoryUrl: 'https://github.com/example/logvault.git', repositoryRef: 'main',
        environment: { ARGUS_DR_POSTGRES_REPLICATION_PASSWORD: 'replication-secret' } }
    });
    expect(applied).toHaveLength(1);
    const reused = await app.inject({ method: 'POST', url: '/v1/continuity/enroll',
      headers: { authorization: `Bearer ${issued.token}`, 'content-type': 'application/json' }, payload });
    expect(reused.statusCode).toBe(401);
    await app.close();
  });
});
