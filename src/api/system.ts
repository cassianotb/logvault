import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from './auth.js';
import { CLOUD_METRICS_TENANT_ID, type ClickHouseRepository } from './clickhouse.js';
import { collectorConnectionStatus } from './collectors.js';
import { deviceFreshnessStatus } from './devices.js';
import type { AlertSource, PostgresRepository } from './postgres.js';
import type { HostMetrics } from '../core/host-metrics.js';
import { hasPlatformAccess } from './access-control.js';
import type { ContinuitySnapshot } from './continuity.js';

interface BackupMetadata {
  id: string;
  createdAt: string;
  backupType?: 'full' | 'incremental';
  baseBackupId?: string | null;
  postgresBytes: number;
  clickhouseBytes: number;
  collectorBytes: number;
  collectorIncluded: boolean;
}

interface RemoteBackupState {
  enabled: boolean;
  status: 'disabled' | 'ok' | 'pending' | 'failed' | 'never';
  lastBackupId: string | null;
  copiedAt: string | null;
  failedAt: string | null;
}

export function validBackupId(value: string): boolean {
  return /^\d{8}T\d{6}Z$/.test(value);
}

export interface OperationalAlert {
  id: string;
  severity: 'critical' | 'warning';
  source: AlertSource;
  title: string;
  detail: string;
  tenantId?: string;
  tenantName?: string;
}

const alertIdParamsSchema = z.object({ alertId: z.string().min(1).max(500) });
const alertInvestigationQuerySchema = z.object({ tenantId: z.string().uuid().optional() });

async function hideDismissedAlerts(
  postgres: PostgresRepository,
  tenantId: string,
  alerts: OperationalAlert[]
): Promise<OperationalAlert[]> {
  if (typeof postgres.reconcileAlertDismissals !== 'function' || typeof postgres.listActiveAlertDismissals !== 'function') return alerts;
  await postgres.reconcileAlertDismissals(tenantId, alerts.map((alert) => alert.id));
  const dismissed = new Set(await postgres.listActiveAlertDismissals(tenantId));
  return alerts.filter((alert) => !dismissed.has(alert.id));
}

function isPlatformGlobalAlert(alert: OperationalAlert): boolean {
  return alert.source === 'backup' || alert.source === 'continuity' || alert.id.startsWith('server:cloud-primary:');
}

export function alertInvestigationGuidance(source: AlertSource): {
  explanation: string;
  recommendedActions: string[];
} {
  const guidance: Record<AlertSource, { explanation: string; recommendedActions: string[] }> = {
    parser: {
      explanation: 'O LogVault preservou o registro bruto, mas não conseguiu transformá-lo em um evento CGNAT válido.',
      recommendedActions: [
        'Compare as amostras recentes com o formato de exportação configurado no equipamento.',
        'Confirme se o vendor e o IP de origem cadastrados correspondem ao equipamento que enviou o registro.',
        'Em NetFlow v9, confirme que os templates continuam sendo exportados; em A10, revise o formato customizado do Syslog.'
      ]
    },
    device: {
      explanation: 'O equipamento deixou de enviar registros dentro da janela esperada pelo monitoramento.',
      recommendedActions: [
        'Confira o processo de exportação no equipamento e o endereço e a porta configurados.',
        'Valide rota, ACL e firewall entre o equipamento e o coletor.',
        'Confirme que o IP de origem do cadastro é o mesmo observado pelo coletor.'
      ]
    },
    collector: {
      explanation: 'O heartbeat do coletor não chegou dentro da janela esperada.',
      recommendedActions: [
        'Verifique se o serviço ou container do coletor está em execução.',
        'Valide conectividade HTTPS entre o coletor e a API do LogVault.',
        'Consulte os logs do coletor para erros de autenticação ou sincronização.'
      ]
    },
    spool: {
      explanation: 'Existem registros preservados localmente que ainda não foram confirmados pela nuvem.',
      recommendedActions: [
        'Verifique a conectividade do coletor com a API e o último erro de sincronização.',
        'Confirme a disponibilidade do PostgreSQL, ClickHouse e API antes de reiniciar serviços.',
        'Não remova o arquivo SQLite: a fila será reenviada automaticamente após a recuperação.'
      ]
    },
    backup: {
      explanation: 'A proteção local ou a cópia externa não concluiu dentro da política configurada.',
      recommendedActions: [
        'Consulte a seção Sistema para identificar a última execução concluída.',
        'Verifique espaço em disco, permissões do volume e conectividade do destino externo.',
        'Execute um backup manual após corrigir a causa e valide o novo ponto de restauração.'
      ]
    },
    server: {
      explanation: 'Um recurso do servidor ultrapassou o limite operacional monitorado pelo LogVault.',
      recommendedActions: [
        'Abra a seção Servidores e compare o uso atual com os gráficos das últimas horas.',
        'Identifique o processo ou volume responsável pelo consumo antes de reiniciar serviços.',
        'Amplie recursos ou armazenamento se o crescimento for contínuo.'
      ]
    },
    continuity: {
      explanation: 'A replicação ou um serviço necessário para assumir a operação no datacenter standby está fora dos limites.',
      recommendedActions: [
        'Abra Continuidade e identifique o componente crítico ou com atraso.',
        'Confirme conectividade, espaço em disco, streaming WAL e checkpoints do ClickHouse antes de qualquer intervenção.',
        'Não promova o standby sem isolar o site ativo e seguir o runbook de failover.'
      ]
    }
  };
  return guidance[source];
}

export type BackupOperationalStatus = 'ok' | 'delayed' | 'overdue' | 'failed' | 'never';

const SPOOL_WARNING_AGE_MS = 5 * 60 * 1000;
const SPOOL_CRITICAL_AGE_MS = 30 * 60 * 1000;

interface CollectorSpoolAlertInput {
  id: string;
  name: string;
  pendingRecords: number;
  pendingEvents: number;
  oldestPendingAt: string | null;
  lastSyncError: string;
}

function appendResourceAlerts(
  alerts: OperationalAlert[],
  serverId: string,
  serverName: string,
  metrics: HostMetrics | null | undefined
): void {
  if (!metrics) return;
  const memory = metrics.memoryTotalBytes > 0 ? metrics.memoryUsedBytes / metrics.memoryTotalBytes * 100 : 0;
  const disk = metrics.diskTotalBytes && metrics.diskUsedBytes !== null ? metrics.diskUsedBytes / metrics.diskTotalBytes * 100 : 0;
  const resources = [
    { key: 'cpu', label: 'CPU', value: metrics.cpuUsagePercent ?? 0, warning: 80 },
    { key: 'memory', label: 'RAM', value: memory, warning: 85 },
    { key: 'storage', label: 'armazenamento', value: disk, warning: 85 }
  ];
  for (const resource of resources) {
    if (resource.value < resource.warning) continue;
    alerts.push({
      id: `server:${serverId}:${resource.key}`,
      severity: resource.value >= 95 ? 'critical' : 'warning',
      source: 'server',
      title: `${serverName}: uso elevado de ${resource.label}`,
      detail: `${resource.label} em ${resource.value.toFixed(1)}%.`
    });
  }
}

export function backupOperationalStatus(
  latestAt: string | null,
  lastFailureAt: string | null,
  expectedHours: number,
  nowMs = Date.now()
): { status: BackupOperationalStatus; ageHours: number | null } {
  const latestMs = latestAt ? Date.parse(latestAt) : Number.NaN;
  const ageHours = Number.isFinite(latestMs) ? Math.max(0, (nowMs - latestMs) / 3_600_000) : null;
  if (lastFailureAt && (!Number.isFinite(latestMs) || Date.parse(lastFailureAt) > latestMs)) {
    return { status: 'failed', ageHours };
  }
  if (ageHours === null) return { status: 'never', ageHours };
  if (ageHours > expectedHours * 2) return { status: 'overdue', ageHours };
  if (ageHours > expectedHours * 1.25) return { status: 'delayed', ageHours };
  return { status: 'ok', ageHours };
}

export function collectorSpoolAlert(
  collector: CollectorSpoolAlertInput,
  nowMs = Date.now()
): OperationalAlert | undefined {
  if (collector.pendingRecords === 0) return undefined;

  const oldestPendingMs = collector.oldestPendingAt ? Date.parse(collector.oldestPendingAt) : Number.NaN;
  const pendingAgeMs = Number.isFinite(oldestPendingMs) ? Math.max(0, nowMs - oldestPendingMs) : 0;
  const hasSyncError = collector.lastSyncError.trim().length > 0;
  if (!hasSyncError && pendingAgeMs < SPOOL_WARNING_AGE_MS) return undefined;

  const severity = hasSyncError || pendingAgeMs >= SPOOL_CRITICAL_AGE_MS ? 'critical' : 'warning';
  const ageMinutes = pendingAgeMs / 60_000;
  const ageDetail = Number.isFinite(oldestPendingMs)
    ? ` Item mais antigo pendente há ${ageMinutes < 10 ? ageMinutes.toFixed(1) : ageMinutes.toFixed(0)} minuto(s).`
    : '';
  const errorDetail = hasSyncError ? ` Erro de sincronização: ${collector.lastSyncError.trim()}` : '';
  return {
    id: `spool:${collector.id}`,
    severity,
    source: 'spool',
    title: `${collector.name}: fila pendente`,
    detail: `${collector.pendingRecords} registro(s) e ${collector.pendingEvents} evento(s) aguardando confirmação.${ageDetail}${errorDetail}`
  };
}

function validBackupMetadata(value: unknown): value is BackupMetadata {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string'
    && validBackupId(candidate.id)
    && typeof candidate.createdAt === 'string'
    && Number.isFinite(Date.parse(candidate.createdAt))
    && (candidate.backupType === undefined || ['full', 'incremental'].includes(String(candidate.backupType)))
    && (
      candidate.baseBackupId === undefined
      || candidate.baseBackupId === null
      || typeof candidate.baseBackupId === 'string' && validBackupId(candidate.baseBackupId)
    )
    && typeof candidate.postgresBytes === 'number'
    && typeof candidate.clickhouseBytes === 'number'
    && typeof candidate.collectorBytes === 'number'
    && typeof candidate.collectorIncluded === 'boolean';
}

async function optionalJson(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    return undefined;
  }
}

async function listBackups(root: string): Promise<{ backups: BackupMetadata[]; lastFailureAt: string | null }> {
  let entries: Array<{ name: string; isDirectory(): boolean }> = [];
  try {
    entries = await readdir(join(root, 'runs'), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const candidates = entries
    .filter((entry) => entry.isDirectory() && validBackupId(entry.name))
    .sort((left, right) => right.name.localeCompare(left.name))
    .slice(0, 30);
  const backups = (await Promise.all(candidates.map(async (entry) => {
    try {
      await readFile(join(root, 'runs', entry.name, 'COMPLETE'), 'utf8');
      const metadata = await optionalJson(join(root, 'runs', entry.name, 'metadata.json'));
      return validBackupMetadata(metadata) ? metadata : undefined;
    } catch {
      return undefined;
    }
  }))).filter((backup): backup is BackupMetadata => Boolean(backup));
  const failure = await optionalJson(join(root, 'LAST_FAILURE.json')) as { failedAt?: unknown } | undefined;
  return {
    backups,
    lastFailureAt: typeof failure?.failedAt === 'string' && Number.isFinite(Date.parse(failure.failedAt))
      ? failure.failedAt
      : null
  };
}

async function remoteBackupState(root: string, enabled: boolean, latestBackupId: string | null): Promise<RemoteBackupState> {
  if (!enabled) return { enabled: false, status: 'disabled', lastBackupId: null, copiedAt: null, failedAt: null };
  const success = await optionalJson(join(root, 'LAST_REMOTE_SUCCESS.json')) as { backupId?: unknown; copiedAt?: unknown } | undefined;
  const failure = await optionalJson(join(root, 'LAST_REMOTE_FAILURE.json')) as { failedAt?: unknown } | undefined;
  const lastBackupId = typeof success?.backupId === 'string' && validBackupId(success.backupId) ? success.backupId : null;
  const copiedAt = typeof success?.copiedAt === 'string' && Number.isFinite(Date.parse(success.copiedAt)) ? success.copiedAt : null;
  const failedAt = typeof failure?.failedAt === 'string' && Number.isFinite(Date.parse(failure.failedAt)) ? failure.failedAt : null;
  const failed = Boolean(failedAt && (!copiedAt || Date.parse(failedAt) > Date.parse(copiedAt)));
  return {
    enabled: true,
    status: failed ? 'failed' : !lastBackupId ? 'never' : lastBackupId === latestBackupId ? 'ok' : 'pending',
    lastBackupId,
    copiedAt,
    failedAt
  };
}

export async function collectOperationalAlerts(
  tenantId: string,
  dependencies: {
    postgres: PostgresRepository; clickhouse: ClickHouseRepository; backupRoot: string;
    backupExpectedHours: number; backupRemoteEnabled: boolean; cloudMetricsProvider?: () => HostMetrics;
    continuityProvider?: () => Promise<ContinuitySnapshot>;
  },
  nowMs = Date.now()
): Promise<OperationalAlert[]> {
  const [collectors, devices, activityRows, backupState] = await Promise.all([
    dependencies.postgres.listCollectors(tenantId), dependencies.postgres.listDevices(tenantId),
    dependencies.clickhouse.getDeviceActivity(tenantId), listBackups(dependencies.backupRoot)
  ]);
  const alerts: OperationalAlert[] = [];
  const latestBackup = backupState.backups[0] ?? null;
  const remoteState = await remoteBackupState(dependencies.backupRoot, dependencies.backupRemoteEnabled, latestBackup?.id ?? null);
  const { status: backupStatus, ageHours } = backupOperationalStatus(
    latestBackup?.createdAt ?? null, backupState.lastFailureAt, dependencies.backupExpectedHours, nowMs
  );
  if (backupStatus !== 'ok') {
    alerts.push({
      id: `backup:${backupStatus}`,
      severity: ['failed', 'overdue', 'never'].includes(backupStatus) ? 'critical' : 'warning', source: 'backup',
      title: backupStatus === 'never' ? 'Nenhum backup concluído' : 'Backup fora da janela esperada',
      detail: backupStatus === 'failed' ? `A última tentativa falhou em ${backupState.lastFailureAt}.`
        : ageHours === null ? 'A rotina ainda não produziu um backup completo.' : `Último backup há ${ageHours.toFixed(1)} hora(s).`
    });
  }
  if (remoteState.enabled && remoteState.status !== 'ok') {
    alerts.push({
      id: `backup:remote:${remoteState.status}`, severity: remoteState.status === 'failed' ? 'critical' : 'warning', source: 'backup',
      title: remoteState.status === 'failed' ? 'Cópia externa falhou' : 'Cópia externa pendente',
      detail: remoteState.status === 'failed' ? `A última tentativa falhou em ${remoteState.failedAt}.`
        : remoteState.status === 'never' ? 'Nenhum backup foi copiado para o destino externo.' : `Última cópia externa: ${remoteState.lastBackupId}.`
    });
  }
  for (const collector of collectors) {
    if (collector.configuredStatus === 'disabled') continue;
    const status = collectorConnectionStatus(collector.lastSeenAt, nowMs);
    if (status !== 'connected') alerts.push({
      id: `collector:${collector.id}:${status}`, severity: ['offline', 'never'].includes(status) ? 'critical' : 'warning', source: 'collector',
      title: `${collector.name}: ${status === 'never' ? 'nunca conectou' : status === 'offline' ? 'desconectado' : 'heartbeat atrasado'}`,
      detail: collector.lastSeenAt ? `Último heartbeat em ${collector.lastSeenAt}.` : 'Nenhum heartbeat recebido.'
    });
    const spoolAlert = collectorSpoolAlert(collector, nowMs);
    if (spoolAlert) alerts.push(spoolAlert);
  }
  const activity = new Map(activityRows.map((row) => [row.deviceId, row]));
  for (const device of devices) {
    if (!device.enabled) continue;
    const stats = activity.get(device.id);
    const status = deviceFreshnessStatus(stats?.lastReceivedAt ?? null, nowMs);
    if (status !== 'receiving') alerts.push({
      id: `device:${device.id}:${status}`, severity: status === 'offline' ? 'critical' : 'warning', source: 'device',
      title: `${device.name}: ${status === 'never' ? 'nenhum pacote recebido' : status === 'offline' ? 'sem recebimento' : 'recebimento atrasado'}`,
      detail: stats?.lastReceivedAt ? `Último pacote em ${stats.lastReceivedAt}.` : `Origem ${device.exporterIp}.`
    });
    if ((stats?.parseFailures24h ?? 0) > 0) alerts.push({
      id: `parser:${device.id}`, severity: 'warning', source: 'parser', title: `${device.name}: falhas de interpretação`,
      detail: `${stats?.parseFailures24h ?? 0} registro(s) bruto(s) não foram normalizados nas últimas 24 horas.`
    });
  }
  appendResourceAlerts(alerts, 'cloud-primary', 'Servidor principal', dependencies.cloudMetricsProvider?.());
  for (const collector of collectors) appendResourceAlerts(alerts, `collector:${collector.id}`, collector.name, collector.hostMetrics);
  if (tenantId === CLOUD_METRICS_TENANT_ID && dependencies.continuityProvider) {
    const continuity = await dependencies.continuityProvider();
    if (continuity.configured && (continuity.status === 'warning' || continuity.status === 'critical')) {
      const affected = Object.entries(continuity.components)
        .filter(([, component]) => component.status === 'warning' || component.status === 'critical')
        .map(([name]) => name).join(', ');
      alerts.push({
        id: 'continuity:replication', severity: continuity.status, source: 'continuity',
        title: continuity.status === 'critical' ? 'DC-B não está pronto para failover' : 'Replicação do DC-B exige atenção',
        detail: `RPO observado: ${continuity.estimatedRpoSeconds ?? 'indisponível'} segundo(s). Componentes: ${affected || 'estado consolidado'}.`
      });
    }
  }
  return alerts.sort((left, right) => left.severity === right.severity
    ? left.title.localeCompare(right.title) : left.severity === 'critical' ? -1 : 1);
}

export function registerSystemRoutes(
  app: FastifyInstance,
  dependencies: {
    postgres: PostgresRepository;
    clickhouse: ClickHouseRepository;
    backupRoot: string;
    backupExpectedHours: number;
    backupRetentionDays: number;
    backupRemoteEnabled: boolean;
    cloudMetricsProvider?: () => HostMetrics;
    continuityProvider?: () => Promise<ContinuitySnapshot>;
  }
): void {
  app.get('/v1/system/status', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    const nowMs = Date.now();
    if (session.context === 'platform') {
      const tenants = (await dependencies.postgres.listPlatformTenants()).filter((tenant) => tenant.active);
      const [platformAlerts, tenantAlertGroups, backupState] = await Promise.all([
        collectOperationalAlerts(CLOUD_METRICS_TENANT_ID, dependencies, nowMs),
        Promise.all(tenants.map(async (tenant) => ({
          tenant,
          alerts: await collectOperationalAlerts(tenant.id, dependencies, nowMs)
        }))),
        listBackups(dependencies.backupRoot)
      ]);
      const latestBackup = backupState.backups[0] ?? null;
      const remoteState = await remoteBackupState(
        dependencies.backupRoot, dependencies.backupRemoteEnabled, latestBackup?.id ?? null
      );
      const backupStatus = backupOperationalStatus(
        latestBackup?.createdAt ?? null,
        backupState.lastFailureAt,
        dependencies.backupExpectedHours,
        nowMs
      );
      const visiblePlatformAlerts = await hideDismissedAlerts(dependencies.postgres, CLOUD_METRICS_TENANT_ID, platformAlerts);
      const visibleTenantAlertGroups = await Promise.all(tenantAlertGroups.map(async ({ tenant, alerts }) => ({
        tenant, alerts: await hideDismissedAlerts(dependencies.postgres, tenant.id, alerts)
      })));
      const alerts = [
        ...visiblePlatformAlerts.filter(isPlatformGlobalAlert).map((alert) => ({
          ...alert,
          tenantId: CLOUD_METRICS_TENANT_ID,
          tenantName: 'Plataforma'
        })),
        ...visibleTenantAlertGroups.flatMap(({ tenant, alerts: tenantAlerts }) => tenantAlerts
          .filter((alert) => !isPlatformGlobalAlert(alert))
          .map((alert) => ({ ...alert, tenantId: tenant.id, tenantName: tenant.name })))
      ].sort((left, right) => left.severity === right.severity
        ? left.tenantName.localeCompare(right.tenantName) || left.title.localeCompare(right.title)
        : left.severity === 'critical' ? -1 : 1);
      return reply.send({
        generatedAt: new Date(nowMs).toISOString(),
        scope: 'platform',
        status: alerts.some((alert) => alert.severity === 'critical') ? 'critical' : alerts.length ? 'warning' : 'ok',
        summary: {
          critical: alerts.filter((alert) => alert.severity === 'critical').length,
          warning: alerts.filter((alert) => alert.severity === 'warning').length,
          collectors: tenants.reduce((total, tenant) => total + tenant.collectorCount, 0),
          devices: tenants.reduce((total, tenant) => total + tenant.plan.devicesUsed, 0),
          tenants: tenants.length
        },
        backup: {
          scope: 'platform',
          status: backupStatus.status,
          expectedEveryHours: dependencies.backupExpectedHours,
          retentionDays: dependencies.backupRetentionDays,
          latest: latestBackup,
          lastFailureAt: backupState.lastFailureAt,
          recent: backupState.backups.slice(0, 10),
          downloadAllowed: hasPlatformAccess(session, 'system', 'manage'),
          remote: remoteState
        },
        alerts
      });
    }
    const canViewTenantBackups = hasPlatformAccess(session, 'system', 'view');
    const [collectors, devices, activityRows, tenantBackups] = await Promise.all([
      dependencies.postgres.listCollectors(session.tenantId),
      dependencies.postgres.listDevices(session.tenantId),
      dependencies.clickhouse.getDeviceActivity(session.tenantId),
      canViewTenantBackups ? dependencies.postgres.listTenantBackupJobs(session.tenantId, 10) : Promise.resolve([])
    ]);
    const alerts: OperationalAlert[] = [];
    const latestTenantBackup = tenantBackups.find((backup) => backup.status === 'ready') ?? null;

    for (const collector of collectors) {
      if (collector.configuredStatus === 'disabled') continue;
      const status = collectorConnectionStatus(collector.lastSeenAt, nowMs);
      if (status !== 'connected') {
        alerts.push({
          id: `collector:${collector.id}:${status}`,
          severity: ['offline', 'never'].includes(status) ? 'critical' : 'warning',
          source: 'collector',
          title: `${collector.name}: ${status === 'never' ? 'nunca conectou' : status === 'offline' ? 'desconectado' : 'heartbeat atrasado'}`,
          detail: collector.lastSeenAt ? `Último heartbeat em ${collector.lastSeenAt}.` : 'Nenhum heartbeat recebido.'
        });
      }
      const spoolAlert = collectorSpoolAlert(collector, nowMs);
      if (spoolAlert) alerts.push(spoolAlert);
    }

    const activity = new Map(activityRows.map((row) => [row.deviceId, row]));
    for (const device of devices) {
      if (!device.enabled) continue;
      const stats = activity.get(device.id);
      const status = deviceFreshnessStatus(stats?.lastReceivedAt ?? null, nowMs);
      if (status !== 'receiving') {
        alerts.push({
          id: `device:${device.id}:${status}`,
          severity: status === 'offline' ? 'critical' : 'warning',
          source: 'device',
          title: `${device.name}: ${status === 'never' ? 'nenhum pacote recebido' : status === 'offline' ? 'sem recebimento' : 'recebimento atrasado'}`,
          detail: stats?.lastReceivedAt ? `Último pacote em ${stats.lastReceivedAt}.` : `Origem ${device.exporterIp}.`
        });
      }
      if ((stats?.parseFailures24h ?? 0) > 0) {
        alerts.push({
          id: `parser:${device.id}`,
          severity: 'warning',
          source: 'parser',
          title: `${device.name}: falhas de interpretação`,
          detail: `${stats?.parseFailures24h ?? 0} registro(s) bruto(s) não foram normalizados nas últimas 24 horas.`
        });
      }
    }

    appendResourceAlerts(alerts, 'cloud-primary', 'Servidor principal', dependencies.cloudMetricsProvider?.());
    for (const collector of collectors) {
      appendResourceAlerts(alerts, `collector:${collector.id}`, collector.name, collector.hostMetrics);
    }

    const visibleAlerts = await hideDismissedAlerts(dependencies.postgres, session.tenantId, alerts);
    visibleAlerts.sort((left, right) => left.severity === right.severity ? left.title.localeCompare(right.title) : left.severity === 'critical' ? -1 : 1);
    return reply.send({
      generatedAt: new Date(nowMs).toISOString(),
      status: visibleAlerts.some((alert) => alert.severity === 'critical') ? 'critical' : visibleAlerts.length ? 'warning' : 'ok',
      summary: {
        critical: visibleAlerts.filter((alert) => alert.severity === 'critical').length,
        warning: visibleAlerts.filter((alert) => alert.severity === 'warning').length,
        collectors: collectors.length,
        devices: devices.length
      },
      backup: canViewTenantBackups ? {
        scope: 'tenant', status: latestTenantBackup ? 'ok' : 'never', expectedEveryHours: null,
        retentionDays: 7, latest: latestTenantBackup ? {
          id: latestTenantBackup.id, createdAt: latestTenantBackup.completedAt,
          postgresBytes: latestTenantBackup.byteCount, clickhouseBytes: 0,
          collectorBytes: 0, collectorIncluded: false
        } : null,
        lastFailureAt: tenantBackups.find((backup) => backup.status === 'failed')?.completedAt ?? null,
        recent: [], downloadAllowed: false,
        remote: { enabled: false, status: 'disabled', lastBackupId: null, copiedAt: null, failedAt: null }
      } : null,
      alerts: visibleAlerts
    });
  });

  app.delete<{ Params: { alertId: string } }>('/v1/system/alerts/:alertId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    const params = alertIdParamsSchema.safeParse(request.params);
    const query = alertInvestigationQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_alert_id' });
    let tenantId = session.tenantId;
    if (session.context === 'platform') {
      if (!hasPlatformAccess(session, 'alerts', 'manage')) return reply.code(403).send({ error: 'platform_permission_required' });
      if (!query.data.tenantId) return reply.code(400).send({ error: 'alert_tenant_required' });
      if (query.data.tenantId === CLOUD_METRICS_TENANT_ID) tenantId = CLOUD_METRICS_TENANT_ID;
      else {
        const tenant = (await dependencies.postgres.listPlatformTenants())
          .find((candidate) => candidate.active && candidate.id === query.data.tenantId);
        if (!tenant) return reply.code(404).send({ error: 'tenant_not_found' });
        tenantId = tenant.id;
      }
    } else if (session.role !== 'admin') {
      return reply.code(403).send({ error: 'tenant_administrator_required' });
    }
    const alerts = await collectOperationalAlerts(tenantId, dependencies);
    const alert = alerts.find((candidate) => candidate.id === params.data.alertId
      && (session.platformAdmin || candidate.source !== 'backup'));
    if (!alert) return reply.code(404).send({ error: 'alert_no_longer_active' });
    await dependencies.postgres.dismissOperationalAlert({ tenantId, alertId: alert.id, actorUserId: session.id });
    return reply.code(204).send();
  });

  app.get<{ Params: { alertId: string } }>('/v1/system/alerts/:alertId/investigation', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    const params = alertIdParamsSchema.safeParse(request.params);
    const query = alertInvestigationQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_alert_id' });
    let tenantId = session.tenantId;
    let tenantName: string | null = null;
    if (session.context === 'platform') {
      if (!query.data.tenantId) return reply.code(400).send({ error: 'alert_tenant_required' });
      if (query.data.tenantId === CLOUD_METRICS_TENANT_ID) {
        tenantId = CLOUD_METRICS_TENANT_ID;
        tenantName = 'Plataforma';
      } else {
        const tenant = (await dependencies.postgres.listPlatformTenants())
          .find((candidate) => candidate.active && candidate.id === query.data.tenantId);
        if (!tenant) return reply.code(404).send({ error: 'tenant_not_found' });
        tenantId = tenant.id;
        tenantName = tenant.name;
      }
    }
    const alerts = await collectOperationalAlerts(tenantId, dependencies);
    const alert = alerts.find((candidate) => candidate.id === params.data.alertId);
    if (!alert) return reply.code(404).send({ error: 'alert_no_longer_active' });

    const context: Array<{ label: string; value: string }> = [
      ...(tenantName ? [{ label: 'Cliente', value: tenantName }] : []),
      { label: 'Severidade', value: alert.severity === 'critical' ? 'Crítico' : 'Aviso' },
      { label: 'Origem', value: alert.source },
      { label: 'Estado atual', value: alert.detail }
    ];
    let evidence: Awaited<ReturnType<ClickHouseRepository['getParseFailureEvidence']>> = [];
    if (alert.source === 'parser') {
      const deviceId = alert.id.slice('parser:'.length);
      const device = (await dependencies.postgres.listDevices(tenantId))
        .find((candidate) => candidate.id === deviceId);
      if (device) {
        context.push(
          { label: 'Equipamento', value: device.name },
          { label: 'IP de origem', value: device.exporterIp },
          { label: 'Vendor', value: device.vendor.toUpperCase() }
        );
      }
      if (z.string().uuid().safeParse(deviceId).success) {
        evidence = await dependencies.clickhouse.getParseFailureEvidence(tenantId, deviceId, 8);
      }
    }
    const guidance = alertInvestigationGuidance(alert.source);
    return reply.send({
      generatedAt: new Date().toISOString(),
      alert: tenantName ? { ...alert, tenantId, tenantName } : alert,
      ...guidance,
      context,
      evidence
    });
  });

  app.get<{ Params: { backupId: string } }>('/v1/system/backups/:backupId/download', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    const platformAllowed = session.context === 'platform' && hasPlatformAccess(session, 'system', 'manage');
    if (!platformAllowed) {
      return reply.code(403).send({ error: 'backup_download_access_required' });
    }
    const backupId = request.params.backupId;
    if (!validBackupId(backupId)) return reply.code(400).send({ error: 'invalid_backup_id' });

    const runRoot = join(dependencies.backupRoot, 'runs');
    const backupPath = join(runRoot, backupId);
    try {
      await Promise.all([
        access(join(backupPath, 'COMPLETE'), fsConstants.R_OK),
        access(join(backupPath, 'metadata.json'), fsConstants.R_OK),
        access(join(backupPath, 'checksums.sha256'), fsConstants.R_OK),
        access(join(backupPath, 'postgres.dump'), fsConstants.R_OK),
        access(join(backupPath, 'clickhouse'), fsConstants.R_OK)
      ]);
    } catch {
      return reply.code(404).send({ error: 'backup_not_available' });
    }

    const metadata = await optionalJson(join(backupPath, 'metadata.json'));
    if (!validBackupMetadata(metadata) || metadata.id !== backupId) {
      return reply.code(409).send({ error: 'backup_incomplete' });
    }
    const archiveIds = [backupId];
    let totalBytes = metadata.postgresBytes + metadata.clickhouseBytes + metadata.collectorBytes;
    if ((metadata.backupType ?? 'full') === 'incremental') {
      const baseBackupId = metadata.baseBackupId;
      if (!baseBackupId || !validBackupId(baseBackupId)) {
        return reply.code(409).send({ error: 'backup_base_missing' });
      }
      const basePath = join(runRoot, baseBackupId);
      try {
        await Promise.all([
          access(join(basePath, 'COMPLETE'), fsConstants.R_OK),
          access(join(basePath, 'clickhouse'), fsConstants.R_OK)
        ]);
      } catch {
        return reply.code(409).send({ error: 'backup_base_missing' });
      }
      const baseMetadata = await optionalJson(join(basePath, 'metadata.json'));
      if (!validBackupMetadata(baseMetadata) || baseMetadata.id !== baseBackupId) {
        return reply.code(409).send({ error: 'backup_base_incomplete' });
      }
      archiveIds.unshift(baseBackupId);
      totalBytes += baseMetadata.postgresBytes + baseMetadata.clickhouseBytes + baseMetadata.collectorBytes;
    }
    await dependencies.postgres.auditBackupDownload({
      tenantId: session.tenantId,
      actorUserId: session.id,
      backupId,
      totalBytes,
      ipAddress: request.ip || null,
      userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : ''
    });

    const archive = spawn('tar', ['-czf', '-', '-C', runRoot, ...archiveIds], { stdio: ['ignore', 'pipe', 'pipe'] });
    let archiveError = '';
    archive.stderr.setEncoding('utf8');
    archive.stderr.on('data', (chunk: string) => { archiveError = `${archiveError}${chunk}`.slice(-4000); });
    archive.once('error', (error) => app.log.error({ error, backupId }, 'Falha ao iniciar o pacote de backup'));
    archive.once('close', (code) => {
      if (code !== 0) app.log.error({ code, backupId, archiveError }, 'Falha ao transmitir o pacote de backup');
    });
    reply.raw.once('close', () => {
      if (!reply.raw.writableEnded && !archive.killed && archive.exitCode === null) archive.kill('SIGTERM');
    });

    reply.header('content-type', 'application/gzip');
    reply.header('content-disposition', `attachment; filename="logvault-backup-${backupId}.tar.gz"`);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-argus-backup-id', backupId);
    return reply.send(archive.stdout);
  });
}
