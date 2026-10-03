import type { FastifyInstance, FastifyReply } from 'fastify';
import { Client, type ClientConfig } from 'pg';
import { z } from 'zod';
import { openSecret, sealSecret } from '../core/secret-box.js';
import { authenticateRequest } from './auth.js';
import type { AuthSession, ErpIntegrationRecord, PostgresRepository } from './postgres.js';

const provider = 'elleven';
const providerSchema = z.enum(['elleven']);
const providerParamsSchema = z.object({ provider: providerSchema });
const providerAvailabilitySchema = z.object({ enabled: z.boolean() });
const connectionStatusSchema = z.object({
  status: z.enum(['success', 'failed']),
  testedAt: z.string(),
  message: z.string()
});
function normalizeCandidateColumns(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  const text = value.trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Continua com a leitura dos formatos legados separados por vírgula.
    }
  }
  const content = text.startsWith('{') && text.endsWith('}') ? text.slice(1, -1) : text;
  return content.split(',')
    .map((column) => column.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}
const radiusCandidateSchema = z.object({
  schema: z.string(),
  table: z.string(),
  columns: z.preprocess(normalizeCandidateColumns, z.array(z.string()))
});
const storedSettingsSchema = z.object({
  version: z.literal(1).default(1),
  radius: z.object({
    accessMode: z.enum(['cloud', 'collector']).default('cloud'),
    collectorId: z.string().uuid().nullable().default(null),
    host: z.string().default(''),
    port: z.number().int().default(5432),
    database: z.string().default(''),
    schema: z.string().default('public'),
    username: z.string().default(''),
    sslMode: z.enum(['disable', 'require', 'verify-full']).default('disable'),
    lastTest: connectionStatusSchema.nullable().default(null),
    discoveredAt: z.string().nullable().default(null),
    candidates: z.array(radiusCandidateSchema).default([])
  }).default({}),
  voalleDatabase: z.object({
    host: z.string().default(''),
    port: z.number().int().default(5432),
    database: z.string().default(''),
    schema: z.string().default('public'),
    username: z.string().default(''),
    sslMode: z.enum(['disable', 'require', 'verify-full']).default('disable'),
    lastTest: connectionStatusSchema.nullable().default(null),
    discoveredAt: z.string().nullable().default(null),
    candidates: z.array(radiusCandidateSchema).default([])
  }).default({}),
  mappingStatus: z.enum(['not_configured', 'awaiting_tests', 'awaiting_radius_mapping', 'awaiting_database_mapping', 'ready']).default('not_configured'),
  updatedAt: z.string().nullable().default(null)
});

export type EllevenStoredSettings = z.infer<typeof storedSettingsSchema>;

interface EllevenSecrets {
  radiusPassword: string;
  voalleDatabasePassword: string;
}

const emptySecrets = (): EllevenSecrets => ({ radiusPassword: '', voalleDatabasePassword: '' });
const saveSchema = z.object({
  enabled: z.boolean().default(false),
  radius: z.object({
    accessMode: z.enum(['cloud', 'collector']),
    collectorId: z.string().uuid().nullable().default(null),
    host: z.string().trim().max(253).refine((value) => !/[\s/@]/.test(value), 'Host inválido'),
    port: z.number().int().min(1).max(65535),
    database: z.string().trim().max(128).refine((value) => !/[\r\n]/.test(value), 'Banco inválido'),
    schema: z.string().trim().min(1).max(128).refine((value) => /^[A-Za-z_][A-Za-z0-9_$-]*$/.test(value), 'Schema inválido'),
    username: z.string().trim().max(128).refine((value) => !/[\r\n]/.test(value), 'Usuário inválido'),
    password: z.string().max(2048).default(''),
    sslMode: z.enum(['disable', 'require', 'verify-full'])
  }),
  voalleDatabase: z.object({
    host: z.string().trim().max(253).refine((value) => !/[\s/@]/.test(value), 'Host inválido'),
    port: z.number().int().min(1).max(65535),
    database: z.string().trim().max(128).refine((value) => !/[\r\n]/.test(value), 'Banco inválido'),
    schema: z.string().trim().min(1).max(128).refine((value) => /^[A-Za-z_][A-Za-z0-9_$-]*$/.test(value), 'Schema inválido'),
    username: z.string().trim().max(128).refine((value) => !/[\r\n]/.test(value), 'Usuário inválido'),
    password: z.string().max(2048).default(''),
    sslMode: z.enum(['disable', 'require', 'verify-full'])
  })
});
const targetSchema = z.object({ tenantId: z.string().uuid().optional() });

export interface RadiusDiscoveryResult {
  database: string;
  user: string;
  serverVersion: string;
  candidates: Array<{ schema: string; table: string; columns: string[] }>;
}

export type VoalleDatabaseDiscoveryResult = RadiusDiscoveryResult;

function parseSettings(record: ErpIntegrationRecord | null): EllevenStoredSettings {
  return storedSettingsSchema.parse(record?.settings ?? {});
}

function parseSecrets(record: ErpIntegrationRecord | null, encryptionKey: string): EllevenSecrets {
  if (!record?.secretRef) return emptySecrets();
  const parsed = JSON.parse(openSecret(record.secretRef, encryptionKey)) as Partial<EllevenSecrets>;
  return {
    radiusPassword: typeof parsed.radiusPassword === 'string' ? parsed.radiusPassword : '',
    voalleDatabasePassword: typeof parsed.voalleDatabasePassword === 'string' ? parsed.voalleDatabasePassword : ''
  };
}

function publicIntegration(record: ErpIntegrationRecord | null, encryptionKey: string) {
  const settings = parseSettings(record);
  const secrets = parseSecrets(record, encryptionKey);
  return {
    provider,
    configured: Boolean(record),
    enabled: record?.enabled ?? false,
    radius: {
      ...settings.radius,
      passwordConfigured: Boolean(secrets.radiusPassword)
    },
    voalleDatabase: {
      ...settings.voalleDatabase,
      passwordConfigured: Boolean(secrets.voalleDatabasePassword)
    },
    mappingStatus: settings.mappingStatus,
    updatedAt: settings.updatedAt
  };
}

function requireAdmin(session: AuthSession, reply: FastifyReply): boolean {
  if (session.role === 'admin') return true;
  void reply.code(403).send({ error: 'tenant_administrator_required' });
  return false;
}

function resolveTenant(session: AuthSession, query: unknown, reply: FastifyReply): string | null {
  const parsed = targetSchema.safeParse(query);
  if (!parsed.success) {
    void reply.code(400).send({ error: 'invalid_tenant_target' });
    return null;
  }
  const tenantId = parsed.data.tenantId ?? session.tenantId;
  if (tenantId !== session.tenantId && !session.platformAdmin) {
    void reply.code(403).send({ error: 'platform_administrator_required' });
    return null;
  }
  return tenantId;
}

function diagnostic(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/:\/\/[^/@\s]+:[^/@\s]+@/g, '://***@').replace(/\s+/g, ' ').slice(0, 500);
}

export async function discoverRadiusSchema(input: {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: 'disable' | 'require' | 'verify-full';
}): Promise<RadiusDiscoveryResult> {
  const ssl: ClientConfig['ssl'] = input.sslMode === 'disable' ? false : {
    rejectUnauthorized: input.sslMode === 'verify-full'
  };
  const client = new Client({
    host: input.host,
    port: input.port,
    database: input.database,
    user: input.username,
    password: input.password,
    ssl,
    application_name: 'argus-radius-discovery',
    connectionTimeoutMillis: 8_000,
    query_timeout: 10_000,
    statement_timeout: 10_000
  });
  try {
    await client.connect();
    const identity = await client.query<{ database: string; username: string; version: string }>(`
      SELECT current_database() AS database, current_user AS username,
        current_setting('server_version') AS version
    `);
    const discovery = await client.query<{ table_schema: string; table_name: string; columns: string[] }>(`
      SELECT c.table_schema, c.table_name,
        array_agg(c.column_name ORDER BY c.ordinal_position) AS columns
      FROM information_schema.columns c
      WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
      GROUP BY c.table_schema, c.table_name
      HAVING bool_or(lower(c.column_name) ~ '(user|login|account|name)')
         AND bool_or(lower(c.column_name) ~ '(ip|address|framed)')
         AND bool_or(lower(c.column_name) ~ '(start|stop|time|date|session)')
      ORDER BY c.table_schema, c.table_name
      LIMIT 30
    `);
    const row = identity.rows[0];
    return {
      database: row?.database ?? input.database,
      user: row?.username ?? input.username,
      serverVersion: row?.version ?? '',
      candidates: discovery.rows.map((candidate) => ({
        schema: candidate.table_schema,
        table: candidate.table_name,
        columns: candidate.columns
      }))
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function discoverVoalleDatabaseSchema(input: {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: 'disable' | 'require' | 'verify-full';
}): Promise<VoalleDatabaseDiscoveryResult> {
  const ssl: ClientConfig['ssl'] = input.sslMode === 'disable' ? false : {
    rejectUnauthorized: input.sslMode === 'verify-full'
  };
  const client = new Client({
    host: input.host,
    port: input.port,
    database: input.database,
    user: input.username,
    password: input.password,
    ssl,
    application_name: 'argus-voalle-discovery',
    connectionTimeoutMillis: 8_000,
    query_timeout: 10_000,
    statement_timeout: 10_000
  });
  try {
    await client.connect();
    const identity = await client.query<{ database: string; username: string; version: string }>(`
      SELECT current_database() AS database, current_user AS username,
        current_setting('server_version') AS version
    `);
    const discovery = await client.query<{ table_schema: string; table_name: string; columns: string[] }>(`
      SELECT c.table_schema, c.table_name,
        array_agg(c.column_name ORDER BY c.ordinal_position) AS columns
      FROM information_schema.columns c
      WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
      GROUP BY c.table_schema, c.table_name
      HAVING bool_or(lower(c.column_name) ~ '(user|login|username|pppoe|authentication)')
         AND bool_or(lower(c.column_name) ~ '(client|customer|person|contract|subscriber|people|txid|id)')
      ORDER BY c.table_schema, c.table_name
      LIMIT 40
    `);
    const row = identity.rows[0];
    return {
      database: row?.database ?? input.database,
      user: row?.username ?? input.username,
      serverVersion: row?.version ?? '',
      candidates: discovery.rows.map((candidate) => ({
        schema: candidate.table_schema,
        table: candidate.table_name,
        columns: candidate.columns
      }))
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function registerIntegrationRoutes(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository;
  encryptionKey: string;
  radiusTester?: typeof discoverRadiusSchema;
  voalleDatabaseTester?: typeof discoverVoalleDatabaseSchema;
}): void {
  const providerDescription = (enabled: boolean, extra: Record<string, unknown> = {}) => ({
    provider,
    name: 'Elleven',
    group: 'Grupo Voalle',
    description: 'RADIUS + Voalle Database',
    enabled,
    ...extra
  });

  app.get('/v1/integrations/catalog', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    const enabled = await dependencies.postgres.isIntegrationProviderEnabled(provider);
    return reply.send({ providers: enabled ? [providerDescription(true)] : [] });
  });

  app.get('/v1/platform/integrations', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (!session.platformAdmin || session.context !== 'platform') {
      return reply.code(403).send({ error: 'platform_administrator_required' });
    }
    const providers = await dependencies.postgres.listPlatformIntegrationProviders();
    const elleven = providers.find((item) => item.provider === provider);
    return reply.send({
      providers: [providerDescription(elleven?.enabled ?? false, {
        configuredTenants: elleven?.configuredTenants ?? 0,
        enabledTenants: elleven?.enabledTenants ?? 0,
        updatedAt: elleven?.updatedAt ?? null
      })]
    });
  });

  app.put('/v1/platform/integrations/:provider', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (!session.platformAdmin || session.context !== 'platform') {
      return reply.code(403).send({ error: 'platform_administrator_required' });
    }
    const params = providerParamsSchema.safeParse(request.params);
    const body = providerAvailabilitySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_integration_provider' });
    const updated = await dependencies.postgres.setPlatformIntegrationProvider({
      provider: params.data.provider,
      enabled: body.data.enabled,
      actorUserId: session.id
    });
    return reply.send({ provider: providerDescription(updated.enabled, {
      configuredTenants: updated.configuredTenants,
      enabledTenants: updated.enabledTenants,
      updatedAt: updated.updatedAt
    }) });
  });

  const loadTarget = async (request: Parameters<typeof authenticateRequest>[0], reply: FastifyReply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requireAdmin(session, reply)) return null;
    if (!await dependencies.postgres.isIntegrationProviderEnabled(provider)) {
      void reply.code(403).send({ error: 'integration_provider_unavailable' });
      return null;
    }
    const tenantId = resolveTenant(session, request.query, reply);
    return tenantId ? { session, tenantId } : null;
  };

  app.get('/v1/integrations/elleven', async (request, reply) => {
    const target = await loadTarget(request, reply);
    if (!target) return;
    const record = await dependencies.postgres.getErpIntegration(target.tenantId, provider);
    return reply.send({ integration: publicIntegration(record, dependencies.encryptionKey) });
  });

  app.put('/v1/integrations/elleven', async (request, reply) => {
    const target = await loadTarget(request, reply);
    if (!target) return;
    const parsed = saveSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_elleven_settings', details: parsed.error.flatten() });
    const existing = await dependencies.postgres.getErpIntegration(target.tenantId, provider);
    let previousSecrets: EllevenSecrets;
    try {
      previousSecrets = parseSecrets(existing, dependencies.encryptionKey);
    } catch {
      return reply.code(500).send({ error: 'integration_secret_unreadable' });
    }
    const secrets: EllevenSecrets = {
      radiusPassword: parsed.data.radius.password || previousSecrets.radiusPassword,
      voalleDatabasePassword: parsed.data.voalleDatabase.password || previousSecrets.voalleDatabasePassword
    };
    const radiusComplete = Boolean(parsed.data.radius.host && parsed.data.radius.database && parsed.data.radius.username && secrets.radiusPassword
      && (parsed.data.radius.accessMode === 'cloud' || parsed.data.radius.collectorId));
    const voalleDatabaseComplete = Boolean(parsed.data.voalleDatabase.host && parsed.data.voalleDatabase.database
      && parsed.data.voalleDatabase.username && secrets.voalleDatabasePassword);
    if (parsed.data.enabled && (!radiusComplete || !voalleDatabaseComplete)) {
      return reply.code(400).send({ error: 'integration_configuration_incomplete' });
    }
    const old = parseSettings(existing);
    const radiusChanged = !existing || previousSecrets.radiusPassword !== secrets.radiusPassword
      || JSON.stringify({ ...old.radius, lastTest: undefined, discoveredAt: undefined, candidates: undefined })
        !== JSON.stringify({ ...parsed.data.radius, password: undefined });
    const voalleDatabaseChanged = !existing || previousSecrets.voalleDatabasePassword !== secrets.voalleDatabasePassword
      || JSON.stringify({ ...old.voalleDatabase, lastTest: undefined, discoveredAt: undefined, candidates: undefined })
        !== JSON.stringify({ ...parsed.data.voalleDatabase, password: undefined });
    const settings: EllevenStoredSettings = {
      version: 1,
      radius: {
        accessMode: parsed.data.radius.accessMode,
        collectorId: parsed.data.radius.accessMode === 'collector' ? parsed.data.radius.collectorId : null,
        host: parsed.data.radius.host,
        port: parsed.data.radius.port,
        database: parsed.data.radius.database,
        schema: parsed.data.radius.schema,
        username: parsed.data.radius.username,
        sslMode: parsed.data.radius.sslMode,
        lastTest: radiusChanged ? null : old.radius.lastTest,
        discoveredAt: radiusChanged ? null : old.radius.discoveredAt,
        candidates: radiusChanged ? [] : old.radius.candidates
      },
      voalleDatabase: {
        host: parsed.data.voalleDatabase.host,
        port: parsed.data.voalleDatabase.port,
        database: parsed.data.voalleDatabase.database,
        schema: parsed.data.voalleDatabase.schema,
        username: parsed.data.voalleDatabase.username,
        sslMode: parsed.data.voalleDatabase.sslMode,
        lastTest: voalleDatabaseChanged ? null : old.voalleDatabase.lastTest,
        discoveredAt: voalleDatabaseChanged ? null : old.voalleDatabase.discoveredAt,
        candidates: voalleDatabaseChanged ? [] : old.voalleDatabase.candidates
      },
      mappingStatus: radiusComplete && voalleDatabaseComplete ? 'awaiting_tests' : 'not_configured',
      updatedAt: new Date().toISOString()
    };
    if (settings.radius.lastTest?.status === 'success' && settings.voalleDatabase.lastTest?.status === 'success') {
      settings.mappingStatus = 'ready';
    }
    const record = await dependencies.postgres.saveErpIntegration({
      tenantId: target.tenantId,
      provider,
      baseUrl: '',
      secretRef: sealSecret(JSON.stringify(secrets), dependencies.encryptionKey),
      settings,
      enabled: parsed.data.enabled
    });
    return reply.send({ integration: publicIntegration(record, dependencies.encryptionKey) });
  });

  app.delete('/v1/integrations/elleven', async (request, reply) => {
    const target = await loadTarget(request, reply);
    if (!target) return;
    const deleted = await dependencies.postgres.deleteErpIntegration(target.tenantId, provider);
    if (!deleted) return reply.code(404).send({ error: 'integration_not_configured' });
    return reply.code(204).send();
  });

  app.post('/v1/integrations/elleven/test-radius', async (request, reply) => {
    const target = await loadTarget(request, reply);
    if (!target) return;
    const record = await dependencies.postgres.getErpIntegration(target.tenantId, provider);
    if (!record) return reply.code(409).send({ error: 'integration_not_configured' });
    const settings = parseSettings(record);
    const secrets = parseSecrets(record, dependencies.encryptionKey);
    if (settings.radius.accessMode === 'collector') {
      return reply.code(409).send({ error: 'collector_radius_test_pending', message: 'O teste remoto pelo coletor será habilitado na próxima etapa.' });
    }
    if (!settings.radius.host || !settings.radius.database || !settings.radius.username || !secrets.radiusPassword) {
      return reply.code(409).send({ error: 'radius_not_configured' });
    }
    const testedAt = new Date().toISOString();
    try {
      const result = await (dependencies.radiusTester ?? discoverRadiusSchema)({
        host: settings.radius.host, port: settings.radius.port, database: settings.radius.database,
        username: settings.radius.username, password: secrets.radiusPassword, sslMode: settings.radius.sslMode
      });
      settings.radius.lastTest = { status: 'success', testedAt, message: `Conectado como ${result.user}` };
      settings.radius.discoveredAt = testedAt;
      settings.radius.candidates = result.candidates;
      settings.mappingStatus = settings.voalleDatabase.lastTest?.status === 'success' ? 'ready' : 'awaiting_tests';
      settings.updatedAt = testedAt;
      const saved = await dependencies.postgres.saveErpIntegration({ ...record, settings });
      return reply.send({
        status: 'success', testedAt, database: result.database, serverVersion: result.serverVersion,
        candidates: result.candidates, integration: publicIntegration(saved, dependencies.encryptionKey)
      });
    } catch (error) {
      const message = diagnostic(error);
      settings.radius.lastTest = { status: 'failed', testedAt, message };
      settings.mappingStatus = 'awaiting_tests';
      settings.updatedAt = testedAt;
      const saved = await dependencies.postgres.saveErpIntegration({ ...record, settings });
      request.log.warn({ error, tenantId: target.tenantId }, 'Falha ao testar PostgreSQL do RADIUS');
      return reply.code(502).send({
        error: 'radius_test_failed', message, testedAt,
        integration: publicIntegration(saved, dependencies.encryptionKey)
      });
    }
  });

  app.post('/v1/integrations/elleven/test-voalle-database', async (request, reply) => {
    const target = await loadTarget(request, reply);
    if (!target) return;
    const record = await dependencies.postgres.getErpIntegration(target.tenantId, provider);
    if (!record) return reply.code(409).send({ error: 'integration_not_configured' });
    const settings = parseSettings(record);
    const secrets = parseSecrets(record, dependencies.encryptionKey);
    if (!settings.voalleDatabase.host || !settings.voalleDatabase.database || !settings.voalleDatabase.username
      || !secrets.voalleDatabasePassword) {
      return reply.code(409).send({ error: 'voalle_database_not_configured' });
    }
    const testedAt = new Date().toISOString();
    try {
      const result = await (dependencies.voalleDatabaseTester ?? discoverVoalleDatabaseSchema)({
        host: settings.voalleDatabase.host,
        port: settings.voalleDatabase.port,
        database: settings.voalleDatabase.database,
        username: settings.voalleDatabase.username,
        password: secrets.voalleDatabasePassword,
        sslMode: settings.voalleDatabase.sslMode
      });
      settings.voalleDatabase.lastTest = { status: 'success', testedAt, message: `Conectado como ${result.user}` };
      settings.voalleDatabase.discoveredAt = testedAt;
      settings.voalleDatabase.candidates = result.candidates;
      settings.mappingStatus = settings.radius.lastTest?.status === 'success' ? 'ready' : 'awaiting_tests';
      settings.updatedAt = testedAt;
      const saved = await dependencies.postgres.saveErpIntegration({ ...record, settings });
      return reply.send({
        status: 'success', testedAt, database: result.database, serverVersion: result.serverVersion,
        candidates: result.candidates, integration: publicIntegration(saved, dependencies.encryptionKey)
      });
    } catch (error) {
      const message = diagnostic(error);
      settings.voalleDatabase.lastTest = { status: 'failed', testedAt, message };
      settings.mappingStatus = 'awaiting_tests';
      settings.updatedAt = testedAt;
      const saved = await dependencies.postgres.saveErpIntegration({ ...record, settings });
      request.log.warn({ error, tenantId: target.tenantId }, 'Falha ao testar PostgreSQL do Voalle Database');
      return reply.code(502).send({
        error: 'voalle_database_test_failed', message, testedAt,
        integration: publicIntegration(saved, dependencies.encryptionKey)
      });
    }
  });

}
