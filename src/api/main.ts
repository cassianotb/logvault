import Fastify from 'fastify';
import { loadApiConfig } from '../config.js';
import { CLOUD_METRICS_TENANT_ID, ClickHouseRepository } from './clickhouse.js';
import { registerCollectorRoutes } from './collectors.js';
import { registerDeviceRoutes } from './devices.js';
import { ensureBootstrapAdmin, registerAuthRoutes } from './auth.js';
import { registerAuditRoutes } from './audit.js';
import { registerExportRoutes } from './export.js';
import { registerIngestionRoutes } from './ingestion.js';
import { PostgresRepository, type PlatformContinuitySettings } from './postgres.js';
import { registerSearchRoutes } from './search.js';
import { registerUserRoutes } from './users.js';
import { sha256 } from '../core/crypto.js';
import { HostMetricsSampler, type HostMetrics } from '../core/host-metrics.js';
import { collectOperationalAlerts, registerSystemRoutes } from './system.js';
import { registerAlertRoutes, startAlertProcessor } from './alerts.js';
import { registerCapacityRoutes } from './capacity.js';
import { registerDashboardRoutes } from './dashboard.js';
import { registerServerRoutes } from './servers.js';
import { registerPlatformRoutes, startTenantDeletionProcessor } from './platform.js';
import { DynamicSmtpPasswordResetMailer, type SmtpPasswordResetMailerConfig } from '../core/password-reset-mailer.js';
import { openSecret } from '../core/secret-box.js';
import { registerCompanyRoutes } from './company.js';
import { registerOfficialReportRoutes, startOfficialReportProcessor } from './official-reports.js';
import { registerIntegrationRoutes } from './integrations.js';
import { registerFirewallRoutes } from './firewall.js';
import { createSubscriberResolver } from './subscribers.js';
import { ContinuityMonitor, registerContinuityRoutes, startContinuityActivationProcessor, type ContinuityConnectionSettings, type ContinuityMonitorOptions } from './continuity.js';
import { hostname } from 'node:os';
import { preparePrimaryContinuity } from '../core/continuity-host-control.js';
import { installedApplicationVersion } from '../core/application-version.js';
import { registerBackupRoutes, startBackupProcessor } from './backups.js';
import { configureAdministrativeReadOnly } from './access-control.js';
import { registerRedundancyRoutes, startRedundancyConfigurationSync } from './redundancy.js';
import type { RedundancyMode } from './postgres.js';

const config = loadApiConfig();
const applicationVersion = installedApplicationVersion();
const alertEncryptionKey = config.ARGUS_ALERT_ENCRYPTION_KEY || config.ARGUS_SYNC_TOKEN;
const drProvisioningKeys = [
  'ARGUS_POSTGRES_PASSWORD', 'ARGUS_DR_POSTGRES_REPLICATION_PASSWORD', 'ARGUS_CLICKHOUSE_PASSWORD',
  'ARGUS_SYNC_TOKEN', 'ARGUS_ALERT_ENCRYPTION_KEY', 'ARGUS_TENANT_ID', 'ARGUS_COLLECTOR_ID',
  'ARGUS_DEVICE_ID', 'ARGUS_DEVICE_VENDOR', 'ARGUS_DEVICE_TIMEZONE', 'ARGUS_DEVICES_JSON',
  'ARGUS_SESSION_TTL_HOURS', 'ARGUS_PASSWORD_RESET_TTL_MINUTES', 'ARGUS_MANAGED_CLOUD_PORT_START',
  'ARGUS_MANAGED_CLOUD_PORT_END', 'ARGUS_MANAGED_CLOUD_SECONDARY_PORT_START',
  'ARGUS_MANAGED_CLOUD_SECONDARY_PORT_END', 'ARGUS_BOOTSTRAP_ADMIN_NAME', 'ARGUS_BOOTSTRAP_ADMIN_EMAIL',
  'ARGUS_BOOTSTRAP_ADMIN_PASSWORD', 'ARGUS_SMTP_HOST', 'ARGUS_SMTP_PORT', 'ARGUS_SMTP_SECURE',
  'ARGUS_SMTP_USER', 'ARGUS_SMTP_PASSWORD', 'ARGUS_SMTP_FROM', 'ARGUS_PUBLIC_URL',
  'ARGUS_COOKIE_SECURE', 'ARGUS_TLS_DOMAIN', 'ARGUS_TLS_EMAIL', 'ARGUS_TLS_CHALLENGE',
  'ARGUS_PROXY_CONFIG', 'ARGUS_HTTP_BIND', 'ARGUS_HTTPS_BIND',
  'ARGUS_BACKUP_INTERVAL_HOURS', 'ARGUS_BACKUP_RETENTION_DAYS',
  'ARGUS_BACKUP_FULL_INTERVAL_DAYS', 'ARGUS_CAPACITY_OFFLINE_HOURS'
] as const;
const drProvisioningEnvironment = Object.fromEntries(drProvisioningKeys
  .map((key) => [key, process.env[key] ?? '']).filter(([, value]) => value !== ''));
const app = Fastify({ logger: true, trustProxy: true });
const postgres = new PostgresRepository(config.ARGUS_POSTGRES_URL);
if (config.ARGUS_REDUNDANCY_ROLE !== 'standalone') {
  await postgres.initializeRedundancyRuntime({
    mode: config.ARGUS_REDUNDANCY_ROLE,
    siteId: config.ARGUS_REDUNDANCY_SITE_ID,
    siteName: config.ARGUS_FIREWALL_SERVER_NAME,
    publicUrl: config.ARGUS_PUBLIC_URL,
    primaryUrl: config.ARGUS_REDUNDANCY_PRIMARY_URL,
    primarySiteId: config.ARGUS_REDUNDANCY_PRIMARY_SITE_ID
  });
}
let currentRedundancyMode: RedundancyMode = (await postgres.getRedundancySettings()).mode;
let stopRedundancyConfigurationSync: () => void = () => undefined;
configureAdministrativeReadOnly(() => currentRedundancyMode === 'secondary');
await postgres.synchronizeInfrastructureFirewallIdentity({
  serverName: config.ARGUS_FIREWALL_SERVER_NAME
});
const clickhouse = new ClickHouseRepository({
  url: config.ARGUS_CLICKHOUSE_URL,
  username: config.ARGUS_CLICKHOUSE_USER,
  password: config.ARGUS_CLICKHOUSE_PASSWORD,
  database: config.ARGUS_CLICKHOUSE_DATABASE
});
const fallbackContinuitySettings: ContinuityConnectionSettings = {
  enabled: config.ARGUS_DR_ENABLED, siteAName: config.ARGUS_DR_SITE_A_NAME, siteBName: config.ARGUS_DR_SITE_B_NAME,
  postgresStandbyUrl: config.ARGUS_DR_POSTGRES_STANDBY_URL,
  clickhouseStandbyUrl: config.ARGUS_DR_CLICKHOUSE_STANDBY_URL,
  clickhouseStandbyUser: config.ARGUS_DR_CLICKHOUSE_STANDBY_USER,
  clickhouseStandbyPassword: config.ARGUS_DR_CLICKHOUSE_STANDBY_PASSWORD,
  standbyApiUrl: config.ARGUS_DR_STANDBY_API_URL,
  warningSeconds: config.ARGUS_DR_LAG_WARNING_SECONDS, criticalSeconds: config.ARGUS_DR_LAG_CRITICAL_SECONDS
};
function decodeContinuitySettings(stored: PlatformContinuitySettings): ContinuityConnectionSettings {
  return {
    enabled: stored.enabled, siteAName: stored.siteAName, siteBName: stored.siteBName,
    postgresStandbyUrl: stored.postgresStandbyUrlSecret ? openSecret(stored.postgresStandbyUrlSecret, alertEncryptionKey) : '',
    clickhouseStandbyUrl: stored.clickhouseStandbyUrl,
    clickhouseStandbyUser: stored.clickhouseStandbyUser,
    clickhouseStandbyPassword: stored.clickhouseStandbyPasswordSecret ? openSecret(stored.clickhouseStandbyPasswordSecret, alertEncryptionKey) : '',
    standbyApiUrl: stored.standbyApiUrl,
    warningSeconds: stored.warningSeconds, criticalSeconds: stored.criticalSeconds
  };
}
const storedContinuitySettings = await postgres.getPlatformContinuitySettings();
const initialContinuitySettings = storedContinuitySettings ? decodeContinuitySettings(storedContinuitySettings) : fallbackContinuitySettings;
let currentContinuitySettings = initialContinuitySettings;
let standbyPostgres: PostgresRepository | undefined;
let standbyClickhouse: ClickHouseRepository | undefined;
function runtimeOptions(settings: ContinuityConnectionSettings): ContinuityMonitorOptions {
  standbyPostgres = settings.postgresStandbyUrl ? new PostgresRepository(settings.postgresStandbyUrl) : undefined;
  standbyClickhouse = settings.clickhouseStandbyUrl ? new ClickHouseRepository({
    url: settings.clickhouseStandbyUrl, username: settings.clickhouseStandbyUser,
    password: settings.clickhouseStandbyPassword, database: config.ARGUS_CLICKHOUSE_DATABASE
  }) : undefined;
  return {
    enabled: settings.enabled, siteAName: settings.siteAName, siteBName: settings.siteBName,
    warningSeconds: settings.warningSeconds, criticalSeconds: settings.criticalSeconds,
    observerSite: config.ARGUS_DR_LOCAL_SITE, observerHostname: hostname(),
    primaryPostgres: postgres, primaryClickhouse: clickhouse,
    ...(standbyPostgres ? { standbyPostgres } : {}), ...(standbyClickhouse ? { standbyClickhouse } : {}),
    ...(settings.standbyApiUrl ? { standbyApiUrl: settings.standbyApiUrl } : {})
  };
}
const continuityMonitor = new ContinuityMonitor(runtimeOptions(initialContinuitySettings));
async function applyContinuityConfiguration(settings: ContinuityConnectionSettings): Promise<void> {
  const oldPostgres = standbyPostgres;
  const oldClickhouse = standbyClickhouse;
  continuityMonitor.configure(runtimeOptions(settings));
  currentContinuitySettings = settings;
  await Promise.all([oldPostgres?.close(), oldClickhouse?.close()]);
}
async function testContinuityConfiguration(settings: ContinuityConnectionSettings) {
  const testPostgres = new PostgresRepository(settings.postgresStandbyUrl);
  const testClickhouse = new ClickHouseRepository({
    url: settings.clickhouseStandbyUrl, username: settings.clickhouseStandbyUser,
    password: settings.clickhouseStandbyPassword, database: config.ARGUS_CLICKHOUSE_DATABASE
  });
  const testMonitor = new ContinuityMonitor({
    enabled: true, siteAName: settings.siteAName, siteBName: settings.siteBName,
    warningSeconds: settings.warningSeconds, criticalSeconds: settings.criticalSeconds,
    observerSite: config.ARGUS_DR_LOCAL_SITE, observerHostname: hostname(),
    primaryPostgres: postgres, standbyPostgres: testPostgres,
    primaryClickhouse: clickhouse, standbyClickhouse: testClickhouse, standbyApiUrl: settings.standbyApiUrl
  });
  try { return await testMonitor.snapshot(); }
  finally { await Promise.all([testPostgres.close(), testClickhouse.close()]); }
}
const cloudHostMetrics = new HostMetricsSampler(config.ARGUS_BACKUP_ROOT);
const subscriberResolver = createSubscriberResolver({ postgres, encryptionKey: alertEncryptionKey });
const fallbackEmailSettings: SmtpPasswordResetMailerConfig = {
  host: config.ARGUS_SMTP_HOST,
  port: config.ARGUS_SMTP_PORT,
  secure: config.ARGUS_SMTP_SECURE,
  user: config.ARGUS_SMTP_USER,
  password: config.ARGUS_SMTP_PASSWORD,
  from: config.ARGUS_SMTP_FROM
};
const passwordResetMailer = new DynamicSmtpPasswordResetMailer(async () => {
  const stored = await postgres.getPlatformEmailSettings();
  if (!stored) return {
    enabled: Boolean(fallbackEmailSettings.host && fallbackEmailSettings.from),
    ...fallbackEmailSettings
  };
  return {
    enabled: stored.enabled,
    host: stored.host,
    port: stored.port,
    secure: stored.secure,
    user: stored.user,
    password: openSecret(stored.passwordSecret, alertEncryptionKey),
    from: stored.from
  };
});
let latestCloudMetrics = cloudHostMetrics.sample();
let latestCloudMetricSampledAt = new Date().toISOString();
let latestStandbyMetrics: HostMetrics | null = null;
let latestStandbyMetricSampledAt: string | null = null;
let latestPrimaryPeerMetrics: HostMetrics | null = null;
let latestPrimaryPeerMetricSampledAt: string | null = null;
let latestPrimaryPeerServerName: string | null = null;
let cloudMetricRecording = false;

function validHostMetrics(value: unknown): value is HostMetrics {
  if (!value || typeof value !== 'object') return false;
  const metrics = value as Partial<HostMetrics>;
  return typeof metrics.hostname === 'string' && typeof metrics.platform === 'string'
    && typeof metrics.uptimeSeconds === 'number' && Number.isFinite(metrics.uptimeSeconds)
    && (metrics.cpuUsagePercent === null || typeof metrics.cpuUsagePercent === 'number')
    && typeof metrics.memoryTotalBytes === 'number' && typeof metrics.memoryUsedBytes === 'number'
    && (metrics.diskTotalBytes === null || typeof metrics.diskTotalBytes === 'number')
    && (metrics.diskUsedBytes === null || typeof metrics.diskUsedBytes === 'number')
    && (metrics.networkReceivedBytesPerSecond === undefined || metrics.networkReceivedBytesPerSecond === null
      || typeof metrics.networkReceivedBytesPerSecond === 'number')
    && (metrics.networkTransmittedBytesPerSecond === undefined || metrics.networkTransmittedBytesPerSecond === null
      || typeof metrics.networkTransmittedBytesPerSecond === 'number');
}

async function refreshStandbyMetric(): Promise<void> {
  if (currentRedundancyMode !== 'standalone' || config.ARGUS_DR_LOCAL_SITE !== 'a' || !currentContinuitySettings.standbyApiUrl) return;
  try {
    const response = await fetch(new URL('/v1/internal/host-metrics', currentContinuitySettings.standbyApiUrl), {
      headers: { accept: 'application/json', authorization: `Bearer ${config.ARGUS_SYNC_TOKEN}` },
      redirect: 'error', signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) return;
    const payload = await response.json() as { sampledAt?: unknown; metrics?: unknown };
    if (!validHostMetrics(payload.metrics) || typeof payload.sampledAt !== 'string' || !Number.isFinite(new Date(payload.sampledAt).getTime())) return;
    latestStandbyMetrics = payload.metrics;
    latestStandbyMetricSampledAt = payload.sampledAt;
    await clickhouse.insertServerMetric({
      tenantId: CLOUD_METRICS_TENANT_ID, serverId: 'cloud-standby',
      sampledAt: payload.sampledAt, metrics: payload.metrics
    });
  } catch {
    // A indisponibilidade fica visível no cartão do DC-B; não polui o log a cada amostra.
  }
}

async function recordCloudMetric(): Promise<void> {
  if (cloudMetricRecording) return;
  cloudMetricRecording = true;
  try {
    latestCloudMetrics = cloudHostMetrics.sample();
    latestCloudMetricSampledAt = new Date().toISOString();
    await clickhouse.insertServerMetric({
      tenantId: CLOUD_METRICS_TENANT_ID,
      serverId: config.ARGUS_REDUNDANCY_ROLE === 'secondary' ? 'cloud-standby' : 'cloud-primary',
      sampledAt: latestCloudMetricSampledAt,
      metrics: latestCloudMetrics
    });
    await refreshStandbyMetric();
  } catch (error) {
    app.log.warn({ error }, 'Falha ao registrar histórico do servidor principal');
  } finally {
    cloudMetricRecording = false;
  }
}

app.get('/v1/internal/host-metrics', async (request, reply) => {
  const authorization = request.headers.authorization ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token || sha256(token) !== sha256(config.ARGUS_SYNC_TOKEN)) return reply.code(401).send({ error: 'invalid_internal_token' });
  return reply.send({ sampledAt: latestCloudMetricSampledAt, metrics: latestCloudMetrics });
});

app.addHook('onSend', async (request, reply, payload) => {
  if (request.url.startsWith('/v1/')) reply.header('cache-control', 'no-store');
  return payload;
});

const platformTenantId = '00000000-0000-0000-0000-000000000000';
const bootstrapCreated = await ensureBootstrapAdmin(postgres, {
  tenantId: platformTenantId,
  name: config.ARGUS_BOOTSTRAP_ADMIN_NAME,
  email: config.ARGUS_BOOTSTRAP_ADMIN_EMAIL,
  password: config.ARGUS_BOOTSTRAP_ADMIN_PASSWORD
});
if (bootstrapCreated) app.log.info({ email: config.ARGUS_BOOTSTRAP_ADMIN_EMAIL }, 'Administrador inicial criado');

const bootstrapPlatformAdminGranted = await postgres.ensureBootstrapPlatformAdministrator(
  platformTenantId,
  config.ARGUS_BOOTSTRAP_ADMIN_EMAIL
);
if (bootstrapPlatformAdminGranted) {
  app.log.info({ email: config.ARGUS_BOOTSTRAP_ADMIN_EMAIL }, 'Administrador inicial promovido para gestão da plataforma');
}

const collectorCredentialInitialized = await postgres.initializeBootstrapCollectorCredential({
  tenantId: config.ARGUS_TENANT_ID,
  collectorId: config.ARGUS_COLLECTOR_ID,
  tokenHash: sha256(config.ARGUS_SYNC_TOKEN)
});
if (collectorCredentialInitialized) {
  app.log.info({ collectorId: config.ARGUS_COLLECTOR_ID }, 'Credencial individual do coletor inicial configurada');
}

app.get('/health/live', async () => ({ status: 'ok', version: applicationVersion }));
app.get('/health/ready', async (_request, reply) => {
  try {
    await Promise.all([postgres.ping(), clickhouse.ping()]);
    return { status: 'ready' };
  } catch (error) {
    return reply.code(503).send({ status: 'not_ready', error: error instanceof Error ? error.message : String(error) });
  }
});

registerIngestionRoutes(app, {
  postgres,
  clickhouse,
  managedCloudTokenHash: sha256(config.ARGUS_SYNC_TOKEN),
  useSecondaryCloudPorts: () => config.ARGUS_REDUNDANCY_ROLE === 'secondary'
});
registerAuthRoutes(app, {
  postgres,
  sessionTtlHours: config.ARGUS_SESSION_TTL_HOURS,
  cookieSecure: config.ARGUS_COOKIE_SECURE,
  passwordResetTtlMinutes: config.ARGUS_PASSWORD_RESET_TTL_MINUTES,
  publicUrl: config.ARGUS_PUBLIC_URL,
  passwordResetMailer
});
registerSearchRoutes(app, { postgres, clickhouse, subscriberResolver });
registerExportRoutes(app, { postgres, clickhouse });
registerCompanyRoutes(app, { postgres });
registerIntegrationRoutes(app, { postgres, encryptionKey: alertEncryptionKey });
const triggerOfficialReport = await startOfficialReportProcessor(app, { postgres });
registerOfficialReportRoutes(app, { postgres, clickhouse, subscriberResolver, trigger: triggerOfficialReport });
registerDeviceRoutes(app, { postgres, clickhouse });
registerCollectorRoutes(app, {
  postgres,
  publicUrl: config.ARGUS_PUBLIC_URL,
  primaryPublicUrl: config.ARGUS_REDUNDANCY_PRIMARY_URL,
  useSecondaryCloudPorts: config.ARGUS_REDUNDANCY_ROLE === 'secondary',
  cloudPortStart: config.ARGUS_MANAGED_CLOUD_PORT_START,
  cloudPortEnd: config.ARGUS_MANAGED_CLOUD_PORT_END,
  secondaryCloudPortStart: config.ARGUS_MANAGED_CLOUD_SECONDARY_PORT_START,
  secondaryCloudPortEnd: config.ARGUS_MANAGED_CLOUD_SECONDARY_PORT_END,
  redundancyDestination: async () => {
    const settings = await postgres.getRedundancySettings();
    if (settings.mode !== 'primary') return null;
    const secondary = (await postgres.listRedundancySites())
      .find((site) => site.role === 'secondary' && site.status === 'active');
    return secondary ? { publicUrl: secondary.publicUrl } : null;
  }
});
registerFirewallRoutes(app, { postgres });
registerUserRoutes(app, { postgres });
registerAuditRoutes(app, { postgres });
registerSystemRoutes(app, {
  postgres,
  clickhouse,
  backupRoot: config.ARGUS_BACKUP_ROOT,
  backupExpectedHours: config.ARGUS_BACKUP_INTERVAL_HOURS,
  backupRetentionDays: config.ARGUS_BACKUP_RETENTION_DAYS,
  backupRemoteEnabled: config.ARGUS_BACKUP_REMOTE_TARGET.length > 0,
  cloudMetricsProvider: () => latestCloudMetrics
});
const triggerBackup = await startBackupProcessor(app, {
  postgres, clickhouse, tenantBackupRoot: config.ARGUS_TENANT_BACKUP_ROOT
});
registerBackupRoutes(app, {
  postgres,
  tenantBackupRoot: config.ARGUS_TENANT_BACKUP_ROOT,
  backupRoot: config.ARGUS_BACKUP_ROOT,
  stagingRoot: config.ARGUS_BACKUP_STAGING_ROOT,
  trigger: triggerBackup
});
registerAlertRoutes(app, { postgres, encryptionKey: alertEncryptionKey });
registerCapacityRoutes(app, {
  postgres,
  clickhouse,
  offlineHours: config.ARGUS_CAPACITY_OFFLINE_HOURS
});
registerDashboardRoutes(app, { postgres, clickhouse });
registerServerRoutes(app, {
  postgres, clickhouse, cloudMetricsProvider: () => latestCloudMetrics,
  localServerName: config.ARGUS_FIREWALL_SERVER_NAME,
  localRedundancyRole: config.ARGUS_REDUNDANCY_ROLE,
  primaryPeerMetricsProvider: async () => {
    const fresh = latestPrimaryPeerMetricSampledAt !== null
      && Date.now() - new Date(latestPrimaryPeerMetricSampledAt).getTime() <= 30_000;
    return {
      metrics: fresh ? latestPrimaryPeerMetrics : null,
      sampledAt: latestPrimaryPeerMetricSampledAt,
      serverName: latestPrimaryPeerServerName
    };
  },
  standbyMetricsProvider: async () => {
    if (config.ARGUS_DR_LOCAL_SITE === 'b') return { metrics: latestCloudMetrics, sampledAt: latestCloudMetricSampledAt };
    const fresh = latestStandbyMetricSampledAt !== null
      && Date.now() - new Date(latestStandbyMetricSampledAt).getTime() <= 30_000;
    return { metrics: fresh ? latestStandbyMetrics : null, sampledAt: fresh ? latestStandbyMetricSampledAt : null };
  }
});
registerContinuityRoutes(app, {
  postgres, monitor: continuityMonitor, encryptionKey: alertEncryptionKey,
  fallbackSettings: fallbackContinuitySettings,
  testConfiguration: testContinuityConfiguration,
  applyConfiguration: applyContinuityConfiguration,
  preparePrimary: async ({ siteAHost, siteBHost }) => preparePrimaryContinuity({
    controlDirectory: config.ARGUS_CONTINUITY_CONTROL_PATH,
    siteAHost,
    siteBHost
  }),
  enrollmentPublicUrl: config.ARGUS_PUBLIC_URL,
  enrollmentTopology: {
    siteAHost: config.ARGUS_DR_SITE_A_HOST || config.ARGUS_DR_SITE_A_PRIVATE_HOST,
    panelHost: config.ARGUS_DR_PANEL_HOST,
    ingestHost: config.ARGUS_DR_INGEST_HOST,
    drControlHost: config.ARGUS_DR_CONTROL_HOST,
    dnsProvider: config.ARGUS_DR_DNS_PROVIDER,
    dnsTtlSeconds: config.ARGUS_DR_DNS_TTL_SECONDS
  },
  provisioning: {
    repositoryUrl: process.env.ARGUS_DR_REPOSITORY_URL || 'https://github.com/cassianotb/logvault.git',
    repositoryRef: process.env.ARGUS_DR_REPOSITORY_REF || 'main',
    environment: drProvisioningEnvironment
  }
});
registerRedundancyRoutes(app, {
  postgres,
  applicationVersion,
  publicUrl: config.ARGUS_PUBLIC_URL,
  serverName: config.ARGUS_FIREWALL_SERVER_NAME,
  localTelemetryProvider: () => ({ metrics: latestCloudMetrics, sampledAt: latestCloudMetricSampledAt }),
  onSiteHeartbeat: async ({ metrics, sampledAt }) => {
    latestStandbyMetrics = metrics;
    latestStandbyMetricSampledAt = sampledAt;
    await clickhouse.insertServerMetric({
      tenantId: CLOUD_METRICS_TENANT_ID, serverId: 'cloud-standby', sampledAt, metrics
    });
  },
  onModeChanged: (mode) => {
    currentRedundancyMode = mode;
    if (mode !== 'secondary') stopRedundancyConfigurationSync();
  }
});
const triggerTenantDeletion = await startTenantDeletionProcessor(app, {
  postgres,
  clickhouse,
  deleteStandbyTenantData: async (tenantId) => {
    if (standbyClickhouse) await standbyClickhouse.deleteTenantData(tenantId);
  },
  backupRetentionDays: config.ARGUS_BACKUP_RETENTION_DAYS,
  remoteBackupConfigured: config.ARGUS_BACKUP_REMOTE_TARGET.length > 0
});
registerPlatformRoutes(app, {
  postgres,
  triggerTenantDeletion,
  backupRetentionDays: config.ARGUS_BACKUP_RETENTION_DAYS,
  remoteBackupConfigured: config.ARGUS_BACKUP_REMOTE_TARGET.length > 0,
  emailEncryptionKey: alertEncryptionKey,
  fallbackEmailSettings
});

await app.listen({ host: config.ARGUS_API_HOST, port: config.ARGUS_API_PORT });
stopRedundancyConfigurationSync = currentRedundancyMode === 'secondary'
  ? startRedundancyConfigurationSync({
      postgres,
      primaryUrl: config.ARGUS_REDUNDANCY_PRIMARY_URL,
      siteId: config.ARGUS_REDUNDANCY_SITE_ID,
      siteToken: config.ARGUS_REDUNDANCY_SITE_TOKEN,
      applicationVersion,
      serverName: config.ARGUS_FIREWALL_SERVER_NAME,
      metricsProvider: () => ({ metrics: latestCloudMetrics, sampledAt: latestCloudMetricSampledAt }),
      onPrimaryTelemetry: async ({ serverName, metrics, sampledAt }) => {
        latestPrimaryPeerServerName = serverName;
        latestPrimaryPeerMetrics = metrics;
        latestPrimaryPeerMetricSampledAt = sampledAt;
        await clickhouse.insertServerMetric({
          tenantId: CLOUD_METRICS_TENANT_ID, serverId: 'cloud-primary', sampledAt, metrics
        });
      },
      intervalMs: config.ARGUS_REDUNDANCY_SYNC_INTERVAL_MS,
      onError: (error) => app.log.warn({ error }, 'Sincronização da configuração redundante adiada')
    })
  : () => undefined;
const stopContinuityActivationProcessor = startContinuityActivationProcessor({
  loadSettings: async () => {
    const stored = await postgres.getPlatformContinuitySettings();
    return stored ? decodeContinuitySettings(stored) : null;
  },
  testConfiguration: testContinuityConfiguration,
  applyConfiguration: applyContinuityConfiguration,
  activateStoredSettings: () => postgres.activatePlatformContinuityAutomatically(),
  onError: (error) => app.log.warn({ err: error }, 'Validação automática do DC-B ainda não foi concluída')
});
const stopAlertProcessor = startAlertProcessor(app, {
  postgres,
  encryptionKey: alertEncryptionKey,
  evaluate: (tenantId) => collectOperationalAlerts(tenantId, {
    postgres, clickhouse,
    backupRoot: config.ARGUS_BACKUP_ROOT,
    backupExpectedHours: config.ARGUS_BACKUP_INTERVAL_HOURS,
    backupRemoteEnabled: config.ARGUS_BACKUP_REMOTE_TARGET.length > 0,
    cloudMetricsProvider: () => latestCloudMetrics
  })
});
void recordCloudMetric();
const cloudMetricTimer = setInterval(() => void recordCloudMetric(), 10_000);
cloudMetricTimer.unref();

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'Encerrando API');
  stopAlertProcessor();
  stopRedundancyConfigurationSync();
  stopContinuityActivationProcessor();
  clearInterval(cloudMetricTimer);
  await app.close();
  await Promise.all([postgres.close(), clickhouse.close(), standbyPostgres?.close(), standbyClickhouse?.close()]);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
