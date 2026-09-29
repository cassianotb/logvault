import type { FastifyInstance } from 'fastify';
import { authenticateRequest } from './auth.js';
import { requirePlatformAccess } from './access-control.js';
import type { ClickHouseRepository } from './clickhouse.js';
import type { PlatformContinuitySettings, PostgresRepository } from './postgres.js';
import { openSecret, sealSecret } from '../core/secret-box.js';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sha256 } from '../core/crypto.js';

export type ContinuityLevel = 'disabled' | 'healthy' | 'warning' | 'critical' | 'unknown';
export type ContinuityPhase = 'not_configured' | 'preparing' | 'protected';

interface ProbeResult<T> { status: ContinuityLevel; detail: string; data: T | null }
type PostgresHealth = Awaited<ReturnType<PostgresRepository['getReplicationHealth']>>;
type ClickHouseHealth = Awaited<ReturnType<ClickHouseRepository['getReplicationHealth']>>;

export interface ContinuitySnapshot {
  configured: boolean;
  phase: ContinuityPhase;
  observer: { site: 'a' | 'b'; hostname: string };
  generatedAt: string;
  status: ContinuityLevel;
  sites: { active: string; standby: string };
  thresholds: { warningSeconds: number; criticalSeconds: number };
  estimatedRpoSeconds: number | null;
  failoverReady: boolean;
  components: {
    postgresPrimary: ProbeResult<PostgresHealth>;
    postgresStandby: ProbeResult<PostgresHealth>;
    clickhousePrimary: ProbeResult<ClickHouseHealth>;
    clickhouseStandby: ProbeResult<ClickHouseHealth>;
    standbyApi: ProbeResult<{ ready: boolean }>;
  };
}

export interface ContinuityMonitorOptions {
  enabled: boolean; siteAName: string; siteBName: string;
  warningSeconds: number; criticalSeconds: number;
  observerSite?: 'a' | 'b'; observerHostname?: string;
  primaryPostgres: Pick<PostgresRepository, 'getReplicationHealth'>;
  standbyPostgres?: Pick<PostgresRepository, 'getReplicationHealth'>;
  primaryClickhouse: Pick<ClickHouseRepository, 'getReplicationHealth'>;
  standbyClickhouse?: Pick<ClickHouseRepository, 'getReplicationHealth'>;
  standbyApiUrl?: string; fetchImpl?: typeof fetch;
}

export interface ContinuityConnectionSettings {
  enabled: boolean; siteAName: string; siteBName: string;
  postgresStandbyUrl: string; clickhouseStandbyUrl: string; clickhouseStandbyUser: string;
  clickhouseStandbyPassword: string; standbyApiUrl: string;
  warningSeconds: number; criticalSeconds: number;
}

function unavailable<T>(detail: string, status: ContinuityLevel = 'unknown'): ProbeResult<T> {
  return { status, detail, data: null };
}

function lagLevel(seconds: number, warning: number, critical: number): ContinuityLevel {
  return seconds > critical ? 'critical' : seconds > warning ? 'warning' : 'healthy';
}

async function safeProbe<T>(run: () => Promise<T>, classify: (data: T) => ProbeResult<T>): Promise<ProbeResult<T>> {
  try { return classify(await run()); } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error), 'critical');
  }
}

export class ContinuityMonitor {
  constructor(private options: ContinuityMonitorOptions) {}

  configure(options: ContinuityMonitorOptions): void { this.options = options; }

  async snapshot(): Promise<ContinuitySnapshot> {
    const standbyRegistered = Boolean(this.options.standbyPostgres || this.options.standbyClickhouse || this.options.standbyApiUrl);
    const base = {
      configured: this.options.enabled, generatedAt: new Date().toISOString(),
      phase: this.options.enabled ? 'protected' as const : standbyRegistered ? 'preparing' as const : 'not_configured' as const,
      observer: { site: this.options.observerSite ?? 'a', hostname: this.options.observerHostname ?? 'LogVault' },
      sites: { active: this.options.siteAName, standby: this.options.siteBName },
      thresholds: { warningSeconds: this.options.warningSeconds, criticalSeconds: this.options.criticalSeconds }
    };
    const pgClassify = (expected: 'primary' | 'standby') => (data: PostgresHealth) => {
      const lag = data.replayLagSeconds ?? 0;
      const roleOk = data.role === expected;
      const connected = expected === 'standby' || data.connectedStandbys > 0;
      const status = !roleOk || !connected ? 'critical' : lagLevel(lag, this.options.warningSeconds, this.options.criticalSeconds);
      return { status, detail: !roleOk ? `Papel inesperado: ${data.role}` : !connected ? 'Nenhum standby em streaming' : 'Replicação WAL ativa', data } as ProbeResult<typeof data>;
    };
    const chClassify = (expected: 'source' | 'standby') => (data: ClickHouseHealth) => {
      const asyncMode = data.replicationMode?.startsWith('async-') ?? false;
      const roleOk = !asyncMode || data.replicationMode === `async-${expected}`;
      const topologyOk = data.replicatedTables >= 3 && roleOk && !data.sessionExpired && data.readonlyTables === 0
        && (asyncMode || (data.activeReplicas ?? 0) >= 2);
      const status = !topologyOk ? 'critical' : lagLevel(data.absoluteDelaySeconds, this.options.warningSeconds, this.options.criticalSeconds);
      return { status, detail: data.replicatedTables < 3 ? 'Tabelas de continuidade incompletas' : !roleOk ? `Papel ClickHouse inesperado: ${data.replicationMode}` : data.sessionExpired ? 'Sessão do Keeper expirada' : data.readonlyTables ? 'Espelhamento assíncrono com erro' : asyncMode ? 'Espelhamento assíncrono ativo' : 'Réplicas e Keeper acessíveis', data } as ProbeResult<typeof data>;
    };
    if (!this.options.enabled) {
      const [postgresPrimary, postgresStandby, clickhousePrimary, clickhouseStandby, standbyApi] = await Promise.all([
        safeProbe(() => this.options.primaryPostgres.getReplicationHealth(), (data) => ({
          status: data.role === 'primary' ? 'healthy' : 'critical',
          detail: data.role === 'primary' ? 'Site ativo acessível; vínculo de replicação pendente' : `Papel inesperado: ${data.role}`,
          data
        })),
        this.options.standbyPostgres
          ? safeProbe(() => this.options.standbyPostgres!.getReplicationHealth(), pgClassify('standby'))
          : Promise.resolve(unavailable<PostgresHealth>('Conexão do PostgreSQL standby não configurada', 'disabled')),
        safeProbe(() => this.options.primaryClickhouse.getReplicationHealth(), (data) => data.replicatedTables > 0
          ? chClassify('source')(data)
          : { status: 'warning', detail: 'Site ativo acessível; migração das tabelas pendente', data }),
        this.options.standbyClickhouse
          ? safeProbe(() => this.options.standbyClickhouse!.getReplicationHealth(), chClassify('standby'))
          : Promise.resolve(unavailable<ClickHouseHealth>('Conexão do ClickHouse standby não configurada', 'disabled')),
        this.probeStandbyApi()
      ]);
      const components = { postgresPrimary, postgresStandby, clickhousePrimary, clickhouseStandby, standbyApi };
      const lagValues = [postgresStandby.data?.replayLagSeconds, clickhouseStandby.data?.absoluteDelaySeconds]
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      return { ...base, status: 'disabled', estimatedRpoSeconds: lagValues.length ? Math.max(...lagValues) : null,
        failoverReady: false, components };
    }
    const [postgresPrimary, postgresStandby, clickhousePrimary, clickhouseStandby, standbyApi] = await Promise.all([
      safeProbe(() => this.options.primaryPostgres.getReplicationHealth(), pgClassify('primary')),
      this.options.standbyPostgres ? safeProbe(() => this.options.standbyPostgres!.getReplicationHealth(), pgClassify('standby')) : Promise.resolve(unavailable<PostgresHealth>('Conexão do PostgreSQL standby não configurada', 'critical')),
      safeProbe(() => this.options.primaryClickhouse.getReplicationHealth(), chClassify('source')),
      this.options.standbyClickhouse ? safeProbe(() => this.options.standbyClickhouse!.getReplicationHealth(), chClassify('standby')) : Promise.resolve(unavailable<ClickHouseHealth>('Conexão do ClickHouse standby não configurada', 'critical')),
      this.probeStandbyApi()
    ]);
    const components = { postgresPrimary, postgresStandby, clickhousePrimary, clickhouseStandby, standbyApi };
    const levels = Object.values(components).map((component) => component.status);
    const status: ContinuityLevel = levels.includes('critical') ? 'critical' : levels.includes('warning') ? 'warning' : levels.includes('unknown') ? 'unknown' : 'healthy';
    const lagValues = [postgresPrimary.data?.replayLagSeconds, clickhousePrimary.data?.absoluteDelaySeconds, clickhouseStandby.data?.absoluteDelaySeconds]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return { ...base, status, estimatedRpoSeconds: lagValues.length ? Math.max(...lagValues) : null,
      failoverReady: status === 'healthy', components };
  }

  private async probeStandbyApi(): Promise<ProbeResult<{ ready: boolean }>> {
    if (!this.options.standbyApiUrl) return unavailable('Endpoint da API standby não configurado', 'critical');
    return safeProbe(async () => {
      const response = await (this.options.fetchImpl ?? fetch)(new URL('/health/ready', this.options.standbyApiUrl), {
        headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(3000)
      });
      return { ready: response.ok };
    }, (data) => ({ status: data.ready ? 'healthy' : 'critical', detail: data.ready ? 'API standby pronta' : 'API standby não está pronta', data }));
  }
}

export interface ContinuityAutomaticActivationDependencies {
  loadSettings: () => Promise<ContinuityConnectionSettings | null>;
  testConfiguration: (settings: ContinuityConnectionSettings) => Promise<ContinuitySnapshot>;
  applyConfiguration: (settings: ContinuityConnectionSettings) => Promise<void>;
  activateStoredSettings: () => Promise<boolean>;
}

export async function tryAutomaticContinuityActivation(
  dependencies: ContinuityAutomaticActivationDependencies
): Promise<'inactive' | 'waiting' | 'activated'> {
  const current = await dependencies.loadSettings();
  if (!current || current.enabled) return 'inactive';
  const candidate = { ...current, enabled: true };
  const snapshot = await dependencies.testConfiguration(candidate);
  if (!snapshot.failoverReady || snapshot.status !== 'healthy') return 'waiting';
  await dependencies.applyConfiguration(candidate);
  return await dependencies.activateStoredSettings() ? 'activated' : 'inactive';
}

export function startContinuityActivationProcessor(
  dependencies: ContinuityAutomaticActivationDependencies & { intervalMs?: number; onError?: (error: unknown) => void }
): () => void {
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try { await tryAutomaticContinuityActivation(dependencies); }
    catch (error) { dependencies.onError?.(error); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => void tick(), dependencies.intervalMs ?? 30_000);
  timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}

export function registerContinuityRoutes(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository; monitor: Pick<ContinuityMonitor, 'snapshot'>;
  encryptionKey?: string;
  fallbackSettings?: ContinuityConnectionSettings;
  testConfiguration?: (settings: ContinuityConnectionSettings) => Promise<ContinuitySnapshot>;
  applyConfiguration?: (settings: ContinuityConnectionSettings) => Promise<void>;
  preparePrimary?: (input: { siteAHost: string; siteBHost: string }) => Promise<{ bind: string; cidr: string }>;
  enrollmentPublicUrl?: string;
  enrollmentTopology?: {
    siteAHost?: string; panelHost?: string; ingestHost?: string; drControlHost?: string;
    dnsProvider?: string; dnsTtlSeconds?: number;
  };
  provisioning?: {
    repositoryUrl: string; repositoryRef: string; environment: Record<string, string>;
  };
}): void {
  app.get('/v1/continuity/status', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (session.context !== 'platform') return reply.code(403).send({ error: 'platform_context_required' });
    if (!requirePlatformAccess(session, reply, 'continuity', 'view')) return;
    return reply.send(await dependencies.monitor.snapshot());
  });

  if (!dependencies.encryptionKey || !dependencies.fallbackSettings || !dependencies.testConfiguration || !dependencies.applyConfiguration) return;
  const encryptionKey = dependencies.encryptionKey;
  const fallback = dependencies.fallbackSettings;
  const testConfiguration = dependencies.testConfiguration;
  const applyConfiguration = dependencies.applyConfiguration;
  const enrollmentPublicUrl = dependencies.enrollmentPublicUrl?.replace(/\/$/, '') ?? '';
  const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

  const settingsSchema = z.object({
    enabled: z.boolean(), siteAName: z.string().trim().min(1).max(100), siteBName: z.string().trim().min(1).max(100),
    postgresStandbyUrl: z.string().trim().max(2048),
    clickhouseStandbyUrl: z.string().trim().url().or(z.literal('')),
    clickhouseStandbyUser: z.string().trim().max(200), clickhouseStandbyPassword: z.string().max(2048),
    standbyApiUrl: z.string().trim().url().or(z.literal('')),
    warningSeconds: z.number().int().min(1).max(86400), criticalSeconds: z.number().int().min(2).max(86400)
  }).refine((value) => value.criticalSeconds > value.warningSeconds, {
    message: 'O limite crítico deve ser maior que o limite de aviso', path: ['criticalSeconds']
  }).refine((value) => {
    if (!value.postgresStandbyUrl) return true;
    try { return ['postgres:', 'postgresql:'].includes(new URL(value.postgresStandbyUrl).protocol); } catch { return false; }
  }, {
    message: 'A conexão PostgreSQL deve usar postgres:// ou postgresql://', path: ['postgresStandbyUrl']
  }).refine((value) => {
    if (!value.clickhouseStandbyUrl) return true;
    const url = new URL(value.clickhouseStandbyUrl);
    return !url.username && !url.password;
  }, {
    message: 'Informe usuário e senha do ClickHouse nos campos próprios', path: ['clickhouseStandbyUrl']
  }).refine((value) => {
    if (!value.standbyApiUrl) return true;
    const url = new URL(value.standbyApiUrl);
    return !url.username && !url.password;
  }, {
    message: 'A URL da API não deve conter credenciais', path: ['standbyApiUrl']
  });

  const effective = (stored: PlatformContinuitySettings | null): ContinuityConnectionSettings => stored ? {
    enabled: stored.enabled, siteAName: stored.siteAName, siteBName: stored.siteBName,
    postgresStandbyUrl: stored.postgresStandbyUrlSecret ? openSecret(stored.postgresStandbyUrlSecret, encryptionKey) : '',
    clickhouseStandbyUrl: stored.clickhouseStandbyUrl, clickhouseStandbyUser: stored.clickhouseStandbyUser,
    clickhouseStandbyPassword: stored.clickhouseStandbyPasswordSecret ? openSecret(stored.clickhouseStandbyPasswordSecret, encryptionKey) : '',
    standbyApiUrl: stored.standbyApiUrl, warningSeconds: stored.warningSeconds, criticalSeconds: stored.criticalSeconds
  } : fallback;
  const publicSettings = (settings: ContinuityConnectionSettings, stored: PlatformContinuitySettings | null) => ({
    enabled: settings.enabled, siteAName: settings.siteAName, siteBName: settings.siteBName,
    postgresStandbyConfigured: Boolean(settings.postgresStandbyUrl), clickhouseStandbyUrl: settings.clickhouseStandbyUrl,
    clickhouseStandbyUser: settings.clickhouseStandbyUser,
    clickhousePasswordConfigured: Boolean(settings.clickhouseStandbyPassword), standbyApiUrl: settings.standbyApiUrl,
    warningSeconds: settings.warningSeconds, criticalSeconds: settings.criticalSeconds,
    lastTestAt: stored?.lastTestAt ?? null, lastTestStatus: stored?.lastTestStatus ?? null,
    lastTestError: stored?.lastTestError ?? '', updatedAt: stored?.updatedAt ?? null,
    routing: stored?.routing ?? null,
    source: stored ? 'platform' : 'environment'
  });
  const authenticate = async (request: Parameters<typeof authenticateRequest>[0], reply: Parameters<typeof authenticateRequest>[1], level: 'view' | 'manage') => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return null;
    if (session.context !== 'platform') { void reply.code(403).send({ error: 'platform_context_required' }); return null; }
    return requirePlatformAccess(session, reply, 'continuity', level) ? session : null;
  };

  const enrollmentConfigurationSchema = z.object({
    siteAName: z.string().trim().min(1).max(100), siteBName: z.string().trim().min(1).max(100),
    postgresStandbyUrl: z.string().trim().max(2048), clickhouseStandbyUrl: z.string().trim().url(),
    clickhouseStandbyUser: z.string().trim().min(1).max(200), clickhouseStandbyPassword: z.string().min(1).max(2048),
    standbyApiUrl: z.string().trim().url(), warningSeconds: z.number().int().min(1).max(86400),
    criticalSeconds: z.number().int().min(2).max(86400)
  });
  const endpointHostSchema = z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
  const routingSchema = z.object({
    siteAHost: endpointHostSchema.optional(), siteBHost: endpointHostSchema.optional(),
    siteAPrivateHost: endpointHostSchema.optional(), siteBPrivateHost: endpointHostSchema.optional(),
    panelHost: z.string().trim().min(1).max(255), ingestHost: z.string().trim().min(1).max(255),
    drControlHost: z.string().trim().min(1).max(255), dnsProvider: z.string().trim().min(2).max(80),
    dnsTtlSeconds: z.number().int().min(30).max(86400)
  }).superRefine((value, context) => {
    if (!value.siteAHost && !value.siteAPrivateHost) context.addIssue({ code: z.ZodIssueCode.custom, path: ['siteAHost'], message: 'endpoint do DC-A obrigatório' });
    if (!value.siteBHost && !value.siteBPrivateHost) context.addIssue({ code: z.ZodIssueCode.custom, path: ['siteBHost'], message: 'endpoint do DC-B obrigatório' });
  }).transform((value) => ({
    siteAHost: value.siteAHost || value.siteAPrivateHost || '', siteBHost: value.siteBHost || value.siteBPrivateHost || '',
    panelHost: value.panelHost, ingestHost: value.ingestHost, drControlHost: value.drControlHost,
    dnsProvider: value.dnsProvider, dnsTtlSeconds: value.dnsTtlSeconds
  }));
  const enrollmentSchema = z.object({
    inventory: z.object({
      generatedAt: z.string().datetime(), hostname: z.string().min(1).max(255), architecture: z.string().min(1).max(50),
      operatingSystem: z.string().min(1).max(300), vcpu: z.number().int().positive().max(4096),
      memoryGiB: z.number().int().positive().max(1_000_000),
      disksGiB: z.object({ system: z.number().int().nonnegative(), postgres: z.number().int().nonnegative(), clickhouse: z.number().int().nonnegative() }),
      docker: z.object({ engine: z.string().max(100), compose: z.string().max(100) }),
      ntpSynchronized: z.boolean(), requirements: z.record(z.number()),
      result: z.enum(['approved', 'rejected']), failures: z.number().int().nonnegative(), warnings: z.number().int().nonnegative(),
      network: z.object({
        primaryIpv4: z.string().max(64), interface: z.string().max(100), defaultGateway: z.string().max(64)
      }).optional(),
      storage: z.object({
        postgres: z.object({
          path: z.string().max(4096), mount: z.string().max(4096), source: z.string().max(4096),
          filesystem: z.string().max(100), sizeBytes: z.number().nonnegative(), availableBytes: z.number().nonnegative()
        }),
        clickhouse: z.object({
          path: z.string().max(4096), mount: z.string().max(4096), source: z.string().max(4096),
          filesystem: z.string().max(100), sizeBytes: z.number().nonnegative(), availableBytes: z.number().nonnegative()
        })
      }).optional()
    }),
    configuration: enrollmentConfigurationSchema,
    routing: routingSchema
  });
  const enrollmentParamsSchema = z.object({ enrollmentId: z.string().uuid() });
  const enrollmentCreationSchema = z.object({
    siteAName: z.string().trim().min(1).max(100).default(fallback.siteAName),
    siteBName: z.string().trim().min(1).max(100).default(fallback.siteBName),
    siteAHost: endpointHostSchema,
    siteBHost: endpointHostSchema
  }).refine((value) => value.siteAName.toLocaleLowerCase() !== value.siteBName.toLocaleLowerCase(), {
    message: 'Os sites precisam ter nomes diferentes', path: ['siteBName']
  });

  app.get('/v1/continuity/installer', async (_request, reply) => {
    try {
      const script = await readFile(resolve(process.cwd(), 'scripts/install-dc-b.sh'), 'utf8');
      return reply.type('text/x-shellscript; charset=utf-8').header('content-disposition', 'attachment; filename="install-dc-b.sh"').send(script);
    } catch {
      return reply.code(404).send({ error: 'continuity_installer_unavailable' });
    }
  });

  app.get('/v1/continuity/enrollments/current', async (request, reply) => {
    if (!await authenticate(request, reply, 'view')) return;
    const [enrollment, settings] = await Promise.all([
      dependencies.postgres.getCurrentContinuityEnrollment(), dependencies.postgres.getPlatformContinuitySettings()
    ]);
    return reply.send({
      enrollment, routing: settings?.routing ?? null,
      defaults: { siteAHost: dependencies.enrollmentTopology?.siteAHost ?? '' }
    });
  });

  app.post('/v1/continuity/enrollments', async (request, reply) => {
    const session = await authenticate(request, reply, 'manage');
    if (!session) return;
    const names = enrollmentCreationSchema.safeParse(request.body ?? {});
    if (!names.success) return reply.code(400).send({ error: 'invalid_site_names', details: names.error.flatten() });
    if (!enrollmentPublicUrl) return reply.code(409).send({ error: 'public_url_not_configured' });
    const publicUrl = new URL(enrollmentPublicUrl);
    if (!['http:', 'https:'].includes(publicUrl.protocol)) return reply.code(409).send({ error: 'invalid_public_url_protocol' });
    const enrollmentTopology = dependencies.enrollmentTopology ?? {};
    let preparation: { bind: string; cidr: string } | null = null;
    if (dependencies.preparePrimary) {
      try {
        preparation = await dependencies.preparePrimary({ siteAHost: names.data.siteAHost, siteBHost: names.data.siteBHost });
      } catch (error) {
        return reply.code(409).send({
          error: 'dc_a_preparation_failed',
          message: error instanceof Error ? error.message : 'não foi possível preparar o DC-A'
        });
      }
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const enrollment = await dependencies.postgres.createContinuityEnrollment({
      actorUserId: session.id, tokenHash: sha256(token), expiresAt
    });
    const installerUrl = `${enrollmentPublicUrl}/api/v1/continuity/installer`;
    const allowHttp = publicUrl.protocol === 'http:' ? ' --allow-http' : '';
    const topology = enrollmentTopology;
    const siteAHost = names.data.siteAHost;
    const siteBHost = names.data.siteBHost;
    const panelHost = topology.panelHost || publicUrl.hostname;
    const ingestHost = topology.ingestHost || publicUrl.hostname;
    const drControlHost = topology.drControlHost || publicUrl.hostname;
    const dnsProvider = topology.dnsProvider || 'manual';
    const dnsTtlSeconds = topology.dnsTtlSeconds ?? 300;
    const command = `curl -fsSLo /tmp/install-dc-b.sh ${shellQuote(installerUrl)} && chmod 700 /tmp/install-dc-b.sh && sudo ARGUS_DC_B_ENROLLMENT_TOKEN=${shellQuote(token)} /tmp/install-dc-b.sh install --yes --argus-url ${shellQuote(enrollmentPublicUrl)} --site-a-name ${shellQuote(names.data.siteAName)} --site-b-name ${shellQuote(names.data.siteBName)} --site-a-host ${shellQuote(siteAHost)} --site-b-host ${shellQuote(siteBHost)} --panel-host ${shellQuote(panelHost)} --ingest-host ${shellQuote(ingestHost)} --dr-control-host ${shellQuote(drControlHost)} --dns-provider ${shellQuote(dnsProvider)} --dns-ttl ${dnsTtlSeconds}${allowHttp}`;
    return reply.code(201).send({ enrollment, token, command, preparation });
  });

  app.delete('/v1/continuity/enrollments/:enrollmentId', async (request, reply) => {
    const session = await authenticate(request, reply, 'manage');
    if (!session) return;
    const params = enrollmentParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_enrollment_id' });
    const revoked = await dependencies.postgres.revokeContinuityEnrollment({ actorUserId: session.id, enrollmentId: params.data.enrollmentId });
    return revoked ? reply.code(204).send() : reply.code(409).send({ error: 'enrollment_not_pending' });
  });

  app.post('/v1/continuity/enroll', async (request, reply) => {
    const authorization = request.headers.authorization ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) return reply.code(401).send({ error: 'invalid_enrollment_token' });
    const parsed = enrollmentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_enrollment_payload', details: parsed.error.flatten() });
    if (parsed.data.inventory.result !== 'approved' || parsed.data.inventory.failures !== 0) {
      return reply.code(422).send({ error: 'dc_b_preflight_rejected' });
    }
    const validatedSettings = settingsSchema.safeParse({ enabled: false, ...parsed.data.configuration });
    if (!validatedSettings.success) return reply.code(400).send({ error: 'invalid_enrollment_configuration' });
    const settings: ContinuityConnectionSettings = validatedSettings.data;
    let postgresMonitorPassword = '';
    try { postgresMonitorPassword = decodeURIComponent(new URL(settings.postgresStandbyUrl).password); } catch { /* validado acima */ }
    if (postgresMonitorPassword.length < 16) return reply.code(400).send({ error: 'postgres_monitor_password_required' });
    const result = await dependencies.postgres.consumeContinuityEnrollment({
      tokenHash: sha256(token), inventory: parsed.data.inventory,
      postgresMonitorPassword,
      siteAName: settings.siteAName, siteBName: settings.siteBName,
      postgresStandbyUrlSecret: sealSecret(settings.postgresStandbyUrl, encryptionKey),
      clickhouseStandbyUrl: settings.clickhouseStandbyUrl, clickhouseStandbyUser: settings.clickhouseStandbyUser,
      clickhouseStandbyPasswordSecret: sealSecret(settings.clickhouseStandbyPassword, encryptionKey),
      standbyApiUrl: settings.standbyApiUrl, routing: parsed.data.routing,
      warningSeconds: settings.warningSeconds, criticalSeconds: settings.criticalSeconds
    });
    if (result !== 'enrolled') return reply.code(401).send({ error: 'invalid_or_expired_enrollment_token' });
    await applyConfiguration(settings);
    return reply.code(201).send({
      status: 'enrolled', monitoringEnabled: false,
      ...(dependencies.provisioning ? { provisioning: dependencies.provisioning } : {})
    });
  });

  app.get('/v1/continuity/settings', async (request, reply) => {
    if (!await authenticate(request, reply, 'view')) return;
    const stored = await dependencies.postgres.getPlatformContinuitySettings();
    return reply.send({ settings: publicSettings(effective(stored), stored) });
  });

  app.put('/v1/continuity/settings', async (request, reply) => {
    const session = await authenticate(request, reply, 'manage');
    if (!session) return;
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_continuity_settings', details: parsed.error.flatten() });
    const stored = await dependencies.postgres.getPlatformContinuitySettings();
    const current = effective(stored);
    const next = {
      ...parsed.data,
      postgresStandbyUrl: parsed.data.postgresStandbyUrl || current.postgresStandbyUrl,
      clickhouseStandbyPassword: parsed.data.clickhouseStandbyPassword || current.clickhouseStandbyPassword
    };
    const connectionChanged = Boolean(parsed.data.postgresStandbyUrl && parsed.data.postgresStandbyUrl !== current.postgresStandbyUrl)
      || parsed.data.clickhouseStandbyUrl !== current.clickhouseStandbyUrl
      || parsed.data.clickhouseStandbyUser !== current.clickhouseStandbyUser
      || Boolean(parsed.data.clickhouseStandbyPassword && parsed.data.clickhouseStandbyPassword !== current.clickhouseStandbyPassword)
      || parsed.data.standbyApiUrl !== current.standbyApiUrl;
    if (next.enabled && (!next.postgresStandbyUrl || !next.clickhouseStandbyUrl || !next.clickhouseStandbyUser
      || !next.clickhouseStandbyPassword || !next.standbyApiUrl)) {
      return reply.code(400).send({ error: 'continuity_endpoints_required' });
    }
    if (next.enabled && (connectionChanged || stored?.lastTestStatus !== 'success')) {
      return reply.code(409).send({ error: 'continuity_test_required' });
    }
    const saved = await dependencies.postgres.savePlatformContinuitySettings({
      actorUserId: session.id, enabled: next.enabled, siteAName: next.siteAName, siteBName: next.siteBName,
      postgresStandbyUrlSecret: sealSecret(next.postgresStandbyUrl, encryptionKey),
      clickhouseStandbyUrl: next.clickhouseStandbyUrl, clickhouseStandbyUser: next.clickhouseStandbyUser,
      clickhouseStandbyPasswordSecret: sealSecret(next.clickhouseStandbyPassword, encryptionKey),
      standbyApiUrl: next.standbyApiUrl,
      routing: stored?.routing ?? { siteAHost: '', siteBHost: '', panelHost: '', ingestHost: '', drControlHost: '', dnsProvider: 'manual', dnsTtlSeconds: 300 },
      warningSeconds: next.warningSeconds, criticalSeconds: next.criticalSeconds,
      connectionChanged
    });
    await applyConfiguration(next);
    return reply.send({ settings: publicSettings(next, saved) });
  });

  app.post('/v1/continuity/settings/test', async (request, reply) => {
    const session = await authenticate(request, reply, 'manage');
    if (!session) return;
    const stored = await dependencies.postgres.getPlatformContinuitySettings();
    if (!stored) return reply.code(409).send({ error: 'continuity_settings_not_saved' });
    const settings = { ...effective(stored), enabled: true };
    if (!settings.postgresStandbyUrl || !settings.clickhouseStandbyUrl || !settings.clickhouseStandbyUser
      || !settings.clickhouseStandbyPassword || !settings.standbyApiUrl) {
      return reply.code(409).send({ error: 'continuity_endpoints_required' });
    }
    const snapshot = await testConfiguration(settings);
    const success = snapshot.status === 'healthy';
    const error = success ? '' : Object.values(snapshot.components)
      .filter((component) => component.status !== 'healthy').map((component) => component.detail).join('; ').slice(0, 2000);
    await dependencies.postgres.recordPlatformContinuityTest({ actorUserId: session.id, status: success ? 'success' : 'failed', error });
    if (!success) return reply.code(502).send({ error: 'continuity_test_failed', message: error, snapshot });
    return reply.send({ status: 'success', testedAt: new Date().toISOString(), snapshot });
  });
}
