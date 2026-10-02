import { Pool, type PoolClient } from 'pg';
import type {
  AppliedFirewallPolicy,
  CollectorDeviceConfiguration,
  CollectorHeartbeat,
  FirewallMode,
  FirewallObservation,
  IngestBatch,
  ManagedCloudCollectorConfiguration,
  ManagedCloudCollectorTelemetry
} from '../domain/models.js';
import type { HostMetrics } from '../core/host-metrics.js';
import type { CgnatSearchRow } from './clickhouse.js';
import type { SubscriberSnapshot } from './subscribers.js';
import type { PlatformPermissions } from './access-control.js';
import { normalizePlatformPermissions } from './access-control.js';

export interface BatchRegistration {
  status: 'new' | 'received' | 'committed';
}

export interface QueryAuditInput {
  tenantId: string;
  userId: string | null;
  publicIp: string;
  searchedAt: string;
  port: number | null;
  protocol: number | null;
  erpRequested: boolean;
  resultCount: number;
  requestId: string;
  durationMs: number;
}

export interface AuthUser {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantTimezone: string;
  name: string;
  email: string;
  role: 'admin' | 'operator' | 'auditor';
  platformAdmin: boolean;
  platformOwner?: boolean;
  platformAccessProfileId?: string | null;
  platformAccessProfileName?: string | null;
  platformPermissions?: PlatformPermissions | null;
  passwordHash: string;
}

export interface AuthSession extends Omit<AuthUser, 'passwordHash'> {
  sessionId: string;
  expiresAt: string;
  context: 'platform' | 'tenant';
  homeTenantId: string;
  homeTenantName: string;
  homeTenantTimezone: string;
}

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: AuthUser['role'];
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  platformOwner?: boolean;
  accessProfileId?: string | null;
  accessProfileName?: string | null;
}

export interface PlatformAccessProfile {
  id: string;
  name: string;
  description: string;
  permissions: PlatformPermissions;
  protected: boolean;
  assignedUsers: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceDefinition {
  id: string;
  collectorId: string | null;
  name: string;
  vendor: string;
  model: string | null;
  exporterIp: string;
  timezone: string;
  enabled: boolean;
}

export interface PlatformDeviceDefinition extends DeviceDefinition {
  tenantId: string;
  tenantName: string;
  collectorName: string | null;
}

export interface DeviceDiscoverySession {
  id: string;
  collectorId: string;
  collectorName: string;
  startedAt: string;
  endsAt: string;
}

export type CreateDeviceDiscoverySessionResult =
  | { status: 'created'; session: DeviceDiscoverySession }
  | { status: 'active'; session: DeviceDiscoverySession }
  | { status: 'collector_not_found' };

export interface TenantPlanUsage {
  code: string;
  name: string;
  deviceLimit: number | null;
  devicesUsed: number;
  devicesRemaining: number | null;
}

export interface ServicePlanDefinition {
  code: string;
  name: string;
  deviceLimit: number | null;
  assignedTenants: number;
}

export interface PlatformTenantRecord {
  id: string;
  name: string;
  timezone: string;
  active: boolean;
  logoConfigured: boolean;
  createdAt: string;
  plan: TenantPlanUsage;
  deviceLimitOverride: number | null;
  collectorCount: number;
  enabledCollectorCount: number;
  connectedCollectorCount: number;
  enabledDeviceCount: number;
  userCount: number;
  deletionJobId: string | null;
  deletionStatus: 'pending' | 'running' | 'failed' | null;
}

export interface CompanyProfile {
  tenantId: string;
  tenantName: string;
  legalName: string;
  tradeName: string;
  cnpj: string;
  phone: string;
  email: string;
  postalCode: string;
  street: string;
  addressNumber: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  logoConfigured: boolean;
  updatedAt: string | null;
}

export interface CompanyProfileFields {
  legalName: string;
  tradeName: string;
  cnpj: string;
  phone: string;
  email: string;
  postalCode: string;
  street: string;
  addressNumber: string;
  complement: string;
  district: string;
  city: string;
  state: string;
}

export interface OfficialReportRequestSnapshot {
  publicIp: string;
  searchedAtUtc: string;
  searchedAtLocal: string;
  searchedTimezone: string;
  port: number | null;
  protocol: number | null;
  referenceNumber: string;
  requestingAuthority: string;
  notes: string;
}

export interface OfficialReportJob {
  id: string;
  tenantId: string;
  requestedByUserId: string;
  requestedByName: string;
  queryAuditId: string;
  selectedEventId: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  request: OfficialReportRequestSnapshot;
  cgnat: CgnatSearchRow;
  company: CompanyProfile;
  subscriber: SubscriberSnapshot;
  sha256: string | null;
  errorMessage: string;
  requestedAt: string;
  completedAt: string | null;
}

export interface OfficialReportClaim extends OfficialReportJob {
  logoData: Buffer | null;
  logoMime: 'image/png' | 'image/jpeg' | null;
}

export interface OfficialReportQueryAudit {
  id: string;
  tenantId: string;
  publicIp: string;
  searchedAt: string;
  port: number | null;
  protocol: number | null;
}

export type CreatePlatformTenantResult =
  | { status: 'created'; tenantId: string; adminUserId: string }
  | { status: 'plan_not_found' };

export type UpdatePlatformTenantResult =
  | { status: 'updated' }
  | { status: 'tenant_not_found' }
  | { status: 'plan_not_found' }
  | { status: 'limit_below_usage'; devicesUsed: number };

export type PlatformAuditAction =
  | 'created' | 'updated' | 'activated' | 'deactivated' | 'plan_changed' | 'exported'
  | 'plan_created' | 'plan_updated' | 'plan_deleted'
  | 'tenant_deletion_requested' | 'tenant_deleted' | 'tenant_deletion_failed'
  | 'email_settings_updated' | 'email_tested' | 'company_profile_updated'
  | 'tenant_accessed' | 'tenant_access_ended'
  | 'access_profile_created' | 'access_profile_updated' | 'access_profile_deleted'
  | 'integration_provider_enabled' | 'integration_provider_disabled'
  | 'continuity_settings_updated' | 'continuity_tested'
  | 'continuity_enrollment_created' | 'continuity_enrolled' | 'continuity_enrollment_revoked'
  | 'backup_destination_updated' | 'backup_destination_tested';

export interface PlatformIntegrationProvider {
  provider: string;
  enabled: boolean;
  configuredTenants: number;
  enabledTenants: number;
  updatedAt: string | null;
}

export interface PlatformEmailSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passwordSecret: string;
  from: string;
  lastTestAt: string | null;
  lastTestStatus: 'success' | 'failed' | null;
  lastTestError: string;
  updatedAt: string | null;
}

export interface PlatformContinuitySettings {
  enabled: boolean;
  siteAName: string;
  siteBName: string;
  postgresStandbyUrlSecret: string;
  clickhouseStandbyUrl: string;
  clickhouseStandbyUser: string;
  clickhouseStandbyPasswordSecret: string;
  standbyApiUrl: string;
  routing: ContinuityRoutingSettings;
  warningSeconds: number;
  criticalSeconds: number;
  lastTestAt: string | null;
  lastTestStatus: 'success' | 'failed' | null;
  lastTestError: string;
  updatedAt: string | null;
}

export interface PlatformBackupDestination {
  enabled: boolean;
  provider: 'google_drive';
  folderId: string;
  serviceAccountSecret: string;
  encryptionPassphraseSecret: string;
  retentionDays: number;
  lastTestAt: string | null;
  lastTestStatus: 'success' | 'failed' | null;
  lastTestError: string;
  updatedAt: string | null;
}

export interface TenantBackupJob {
  id: string;
  tenantId: string;
  tenantName: string;
  requestedByUserId: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  sendToGoogleDrive: boolean;
  archiveName: string | null;
  byteCount: number;
  sha256: string | null;
  googleDriveFileId: string | null;
  errorMessage: string;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
}

interface TenantBackupJobRow {
  id: string; tenant_id: string; tenant_name: string; requested_by_user_id: string;
  status: TenantBackupJob['status']; send_to_google_drive: boolean; archive_name: string | null;
  byte_count: string | number; sha256: string | null; google_drive_file_id: string | null;
  error_message: string; requested_at: string; started_at: string | null;
  completed_at: string | null; expires_at: string | null;
}

function mapTenantBackupJob(row: TenantBackupJobRow): TenantBackupJob {
  return {
    id: row.id, tenantId: row.tenant_id, tenantName: row.tenant_name,
    requestedByUserId: row.requested_by_user_id, status: row.status,
    sendToGoogleDrive: row.send_to_google_drive, archiveName: row.archive_name,
    byteCount: Number(row.byte_count), sha256: row.sha256, googleDriveFileId: row.google_drive_file_id,
    errorMessage: row.error_message, requestedAt: new Date(row.requested_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null
  };
}

export interface ContinuityRoutingSettings {
  siteAHost: string;
  siteBHost: string;
  panelHost: string;
  ingestHost: string;
  drControlHost: string;
  dnsProvider: string;
  dnsTtlSeconds: number;
}

export interface ContinuityEnrollment {
  id: string;
  status: 'pending' | 'enrolled' | 'revoked' | 'expired';
  expiresAt: string;
  createdAt: string;
  enrolledAt: string | null;
  inventory: Record<string, unknown> | null;
}

export interface ErpIntegrationRecord {
  tenantId: string;
  provider: string;
  baseUrl: string;
  secretRef: string;
  settings: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

export interface TenantDeletionJob {
  id: string;
  tenantId: string;
  tenantName: string;
  requestedByUserId: string;
  status: 'pending' | 'running' | 'failed';
}

export interface PlatformAuditEvent {
  id: string;
  targetTenantId: string | null;
  targetTenantName: string | null;
  actorName: string;
  actorEmail: string;
  action: PlatformAuditAction;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface PlatformAuditFilters {
  tenantId: string | null;
  action: PlatformAuditAction | null;
  from: string | null;
  to: string | null;
  limit: number;
}

export type CreateManagedDeviceResult =
  | { status: 'created'; device: DeviceDefinition }
  | { status: 'collector_not_found' }
  | { status: 'device_limit_reached'; usage: TenantPlanUsage };

export interface CollectorStatusRecord {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  mode: 'edge' | 'cloud';
  netflowPort: number | null;
  syslogPort: number | null;
  secondaryNetflowPort: number | null;
  secondarySyslogPort: number | null;
  configuredStatus: string;
  version: string | null;
  deviceCount: number;
  lastSeenAt: string | null;
  telemetrySentAt: string | null;
  pendingRecords: number;
  pendingEvents: number;
  pendingBatches: number;
  acknowledgedRecordsRetained: number;
  oldestPendingAt: string | null;
  spoolBytes: number;
  lastSyncAt: string | null;
  lastSyncError: string;
  batches24h: number;
  rawRecords24h: number;
  events24h: number;
  hostMetrics?: HostMetrics | null;
}

export interface CollectorIdentity {
  id: string;
  tenantId: string;
}

export type RedundancyMode = 'standalone' | 'primary' | 'secondary';
export type RedundancyMigrationStatus = 'not_started' | 'ready' | 'migrated' | 'validated';

export interface RedundancySettings {
  mode: RedundancyMode;
  siteId: string;
  siteName: string;
  publicUrl: string;
  primarySiteId: string | null;
  primaryUrl: string;
  authorityEpoch: number;
  configurationRevision: number;
  migrationStatus: RedundancyMigrationStatus;
  pairedAt: string | null;
  promotedAt: string | null;
  updatedAt: string;
}

export interface RedundancySite {
  id: string;
  name: string;
  role: 'primary' | 'secondary';
  publicUrl: string;
  status: 'pending' | 'active' | 'offline' | 'revoked';
  version: string;
  lastSeenAt: string | null;
  pairedAt: string;
}

export interface RedundancyConfigurationSnapshot {
  generatedAt: string;
  authorityEpoch: number;
  configurationRevision: number;
  peerTelemetry?: { serverName: string; version: string; sampledAt: string; metrics: HostMetrics };
  tenants: Array<{ id: string; name: string; timezone: string; active: boolean; tenantKind: string; createdAt: string }>;
  users: Array<{
    id: string; tenantId: string; name: string; email: string; passwordHash: string;
    role: 'admin' | 'operator' | 'auditor'; active: boolean; createdAt: string;
    lastLoginAt: string | null; updatedAt: string; deletedAt: string | null;
  }>;
  servicePlans: Array<{
    id: string; code: string; name: string; maxDevices: number | null; active: boolean;
    sortOrder: number; createdAt: string; updatedAt: string;
  }>;
  tenantPlanAssignments: Array<{
    tenantId: string; planCode: string; deviceLimitOverride: number | null; assignedAt: string; updatedAt: string;
  }>;
  companyProfiles: Array<{
    tenantId: string; legalName: string; tradeName: string; cnpj: string; phone: string; email: string;
    postalCode: string; street: string; addressNumber: string; complement: string; district: string;
    city: string; state: string; logoData: string | null; logoMime: string | null; updatedAt: string;
  }>;
  collectors: Array<{
    id: string; tenantId: string; name: string; mode: 'edge' | 'cloud'; apiKeyHash: string; status: string;
    version: string | null; lastSeenAt: string | null; createdAt: string; updatedAt: string;
    deletedAt: string | null; netflowPort: number | null; syslogPort: number | null;
    secondaryNetflowPort: number | null; secondarySyslogPort: number | null;
  }>;
  devices: Array<{
    id: string; tenantId: string; collectorId: string | null; name: string; vendor: string; model: string | null;
    managementIp: string | null; exporterIp: string; timezone: string; enabled: boolean;
    settings: Record<string, unknown>; createdAt: string; deletedAt: string | null;
  }>;
  firewallPolicies: Array<{ collectorId: string; tenantId: string; mode: FirewallMode; createdAt: string; updatedAt: string }>;
  firewallAuthorizations: Array<{
    id: string; collectorId: string; tenantId: string; sourceCidr: string; description: string; createdAt: string;
  }>;
}

export interface ManagedCollector {
  id: string;
  name: string;
  mode: 'edge' | 'cloud';
  netflowPort: number | null;
  syslogPort: number | null;
  secondaryNetflowPort: number | null;
  secondarySyslogPort: number | null;
  configuredStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface FirewallAuthorizationRecord {
  id: string;
  sourceCidr: string;
  description: string;
  createdAt: string;
}

export interface FirewallObservationRecord {
  sourceIp: string;
  sourceType: 'netflow_v9' | 'syslog';
  firstSeenAt: string;
  lastSeenAt: string;
  packetCount: number;
  blockedPacketCount: number;
  authorized: boolean;
}

export interface FirewallCollectorRecord {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  collectorMode: 'edge' | 'cloud';
  configuredStatus: string;
  netflowPort: number | null;
  syslogPort: number | null;
  secondaryNetflowPort: number | null;
  secondarySyslogPort: number | null;
  policyMode: FirewallMode | null;
  policyUpdatedAt: string | null;
  appliedMode: FirewallMode | null;
  appliedPolicyUpdatedAt: string | null;
  appliedAt: string | null;
  authorizations: FirewallAuthorizationRecord[];
  observations: FirewallObservationRecord[];
}

export type InfrastructureFirewallService = 'web' | 'ssh';
export type InfrastructureFirewallMode = 'open' | 'allowlist';

export interface InfrastructureFirewallPolicy {
  service: InfrastructureFirewallService;
  mode: InfrastructureFirewallMode;
  port: number;
  serverName: string;
  updatedAt: string;
  appliedMode: InfrastructureFirewallMode | null;
  appliedPolicyUpdatedAt: string | null;
  appliedAt: string | null;
  authorizations: FirewallAuthorizationRecord[];
}

export type UpdateInfrastructureFirewallPolicyResult =
  | { status: 'updated'; policy: InfrastructureFirewallPolicy }
  | { status: 'authorization_required' };

export type CreateInfrastructureFirewallAuthorizationResult =
  | { status: 'created'; authorization: FirewallAuthorizationRecord }
  | { status: 'duplicate' };

export type UpdateInfrastructureFirewallAuthorizationResult =
  | { status: 'updated'; authorization: FirewallAuthorizationRecord }
  | { status: 'duplicate' }
  | { status: 'last_authorization_required' }
  | { status: 'authorization_not_found' };

export type DeleteInfrastructureFirewallAuthorizationResult =
  | { status: 'deleted' }
  | { status: 'last_authorization_required' }
  | { status: 'authorization_not_found' };

export type UpdateFirewallPolicyResult =
  | { status: 'updated'; tenantId: string; mode: FirewallMode; updatedAt: string }
  | { status: 'collector_not_found' }
  | { status: 'edge_collector' }
  | { status: 'authorization_required' };

export type CreateFirewallAuthorizationResult =
  | { status: 'created'; tenantId: string; authorization: FirewallAuthorizationRecord }
  | { status: 'collector_not_found' }
  | { status: 'edge_collector' }
  | { status: 'duplicate' };

export type DeleteFirewallAuthorizationResult =
  | { status: 'deleted'; tenantId: string }
  | { status: 'last_authorization_required' }
  | { status: 'authorization_not_found' };

export type CreateManagedCollectorResult =
  | { status: 'created'; collector: ManagedCollector }
  | { status: 'cloud_collector_already_exists' }
  | { status: 'cloud_port_capacity_exhausted' };

export type UpdateManagedCollectorResult =
  | { status: 'updated'; collector: ManagedCollector }
  | { status: 'not_found' }
  | { status: 'mode_immutable' };

export interface AuditTimelineEvent {
  id: string;
  category: 'search' | 'export' | 'auth' | 'users' | 'devices' | 'collectors' | 'firewall' | 'backups';
  action: string;
  actorName: string | null;
  actorEmail: string;
  createdAt: string;
  details: Record<string, unknown>;
}

export type AlertSource = 'backup' | 'collector' | 'continuity' | 'device' | 'parser' | 'spool' | 'server';

export interface AlertNotificationSettings {
  id: string;
  tenantId: string;
  tenantName: string;
  enabled: boolean;
  destinationType: 'generic' | 'discord' | 'telegram';
  destinationSecret: string;
  telegramChatId: string;
  minimumSeverity: 'warning' | 'critical';
  enabledSources: AlertSource[];
  reminderMinutes: number;
  recoveryEnabled: boolean;
  lastTestAt: string | null;
  lastTestStatus: 'success' | 'failed' | null;
  lastTestError: string;
  updatedAt: string | null;
}

export interface AlertDeliveryState {
  notificationSettingId: string;
  alertId: string;
  source: AlertSource;
  severity: 'warning' | 'critical';
  title: string;
  detail: string;
  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  lastNotifiedAt: string | null;
  resolvedAt: string | null;
}

export class PostgresRepository {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10 });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async getReplicationHealth(): Promise<{
    role: 'primary' | 'standby'; connectedStandbys: number; primaryLsn: string | null;
    receiveLsn: string | null; replayLsn: string | null; replayLagSeconds: number | null;
  }> {
    const result = await this.pool.query<{
      in_recovery: boolean; connected_standbys: string; primary_lsn: string | null;
      receive_lsn: string | null; replay_lsn: string | null; replay_lag_seconds: string | null;
    }>(`
      SELECT
        pg_is_in_recovery() AS in_recovery,
        CASE WHEN pg_is_in_recovery() THEN 0 ELSE (SELECT count(*) FROM pg_stat_replication WHERE state = 'streaming') END AS connected_standbys,
        CASE WHEN pg_is_in_recovery() THEN NULL ELSE pg_current_wal_lsn()::text END AS primary_lsn,
        CASE WHEN pg_is_in_recovery() THEN pg_last_wal_receive_lsn()::text ELSE NULL END AS receive_lsn,
        CASE WHEN pg_is_in_recovery() THEN pg_last_wal_replay_lsn()::text ELSE NULL END AS replay_lsn,
        CASE WHEN pg_is_in_recovery() THEN NULL ELSE
          (SELECT MAX(EXTRACT(EPOCH FROM replay_lag)) FROM pg_stat_replication WHERE state = 'streaming') END AS replay_lag_seconds
    `);
    const row = result.rows[0];
    if (!row) throw new Error('PostgreSQL não retornou o estado de replicação');
    return {
      role: row.in_recovery ? 'standby' : 'primary', connectedStandbys: Number(row.connected_standbys),
      primaryLsn: row.primary_lsn, receiveLsn: row.receive_lsn, replayLsn: row.replay_lsn,
      replayLagSeconds: row.replay_lag_seconds === null ? null : Math.max(0, Number(row.replay_lag_seconds))
    };
  }

  async initializeBootstrapCollectorCredential(input: {
    tenantId: string;
    collectorId: string;
    tokenHash: string;
  }): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE collectors
      SET api_key_hash = $3, updated_at = now()
      WHERE id = $1 AND tenant_id = $2 AND api_key_hash = 'homolog-only' AND deleted_at IS NULL
    `, [input.collectorId, input.tenantId, input.tokenHash]);
    return result.rowCount === 1;
  }

  async findCollectorIdentityByTokenHash(tokenHash: string): Promise<CollectorIdentity | undefined> {
    const result = await this.pool.query<{ id: string; tenant_id: string }>(`
      SELECT c.id, c.tenant_id
      FROM collectors c
      JOIN tenants t ON t.id = c.tenant_id
      WHERE c.api_key_hash = $1 AND c.status <> 'disabled' AND c.deleted_at IS NULL AND t.active = true
      LIMIT 1
    `, [tokenHash]);
    const row = result.rows[0];
    return row ? { id: row.id, tenantId: row.tenant_id } : undefined;
  }

  async createBootstrapUser(input: {
    tenantId: string;
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<boolean> {
    const result = await this.pool.query(`
      INSERT INTO users (tenant_id, name, email, password_hash, role, active)
      VALUES ($1, $2, lower($3), $4, 'admin', true)
      ON CONFLICT DO NOTHING
    `, [input.tenantId, input.name, input.email, input.passwordHash]);
    return result.rowCount === 1;
  }

  async ensureBootstrapPlatformAdministrator(tenantId: string, email: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query<{ id: string; tenant_id: string }>(`
        SELECT id, tenant_id
        FROM users
        WHERE lower(email) = lower($2)
          AND tenant_id IN ($1, '00000000-0000-0000-0000-000000000000'::uuid)
          AND role = 'admin' AND active = true AND deleted_at IS NULL
        ORDER BY tenant_id = '00000000-0000-0000-0000-000000000000'::uuid DESC
        LIMIT 1
        FOR UPDATE
      `, [tenantId, email]);
      const user = userResult.rows[0];
      if (!user) {
        await client.query('ROLLBACK');
        return false;
      }
      const grant = await client.query(`
        INSERT INTO platform_administrators (user_id, is_owner, access_profile_id)
        VALUES (
          $1,
          NOT EXISTS (SELECT 1 FROM platform_administrators WHERE is_owner = true),
          CASE WHEN EXISTS (SELECT 1 FROM platform_administrators WHERE is_owner = true)
            THEN '00000000-0000-4000-8000-000000000101'::uuid ELSE NULL END
        )
        ON CONFLICT (user_id) DO NOTHING
      `, [user.id]);
      const moved = user.tenant_id !== '00000000-0000-0000-0000-000000000000';
      if (moved) {
        await client.query(`
          UPDATE users
          SET tenant_id = '00000000-0000-0000-0000-000000000000', updated_at = now()
          WHERE id = $1
        `, [user.id]);
        await client.query(`
          UPDATE user_sessions
          SET revoked_at = COALESCE(revoked_at, now()), active_tenant_id = NULL
          WHERE user_id = $1
        `, [user.id]);
      }
      await client.query('COMMIT');
      return grant.rowCount === 1 || moved;
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async userEmailExists(tenantId: string, email: string): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT 1 FROM users WHERE tenant_id = $1 AND lower(email) = lower($2) LIMIT 1
    `, [tenantId, email]);
    return result.rowCount === 1;
  }

  async findActiveUsersByEmail(email: string): Promise<AuthUser[]> {
    const result = await this.pool.query<{
      id: string;
      tenant_id: string;
      tenant_name: string;
      tenant_timezone: string;
      name: string;
      email: string;
      role: AuthUser['role'];
      platform_admin: boolean;
      platform_owner: boolean;
      access_profile_id: string | null;
      access_profile_name: string | null;
      platform_permissions: unknown | null;
      password_hash: string;
    }>(`
      SELECT u.id, u.tenant_id, t.name AS tenant_name, t.timezone AS tenant_timezone,
        u.name, u.email, u.role, u.password_hash,
        (pa.user_id IS NOT NULL) AS platform_admin,
        COALESCE(pa.is_owner, false) AS platform_owner,
        pa.access_profile_id,
        pap.name AS access_profile_name,
        pap.permissions AS platform_permissions
      FROM users u
      JOIN tenants t ON t.id = u.tenant_id
      LEFT JOIN platform_administrators pa ON pa.user_id = u.id
      LEFT JOIN platform_access_profiles pap ON pap.id = pa.access_profile_id AND pap.deleted_at IS NULL
      WHERE lower(u.email) = lower($1) AND u.active = true AND u.deleted_at IS NULL AND t.active = true
      ORDER BY u.created_at
      LIMIT 2
    `, [email]);
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      tenantTimezone: row.tenant_timezone,
      name: row.name,
      email: row.email,
      role: row.role,
      platformAdmin: row.platform_admin,
      platformOwner: row.platform_owner,
      platformAccessProfileId: row.access_profile_id,
      platformAccessProfileName: row.access_profile_name,
      platformPermissions: row.platform_owner ? null : normalizePlatformPermissions(row.platform_permissions),
      passwordHash: row.password_hash
    }));
  }

  async findActiveUserById(tenantId: string, userId: string): Promise<AuthUser | undefined> {
    const result = await this.pool.query<{
      id: string;
      tenant_id: string;
      tenant_name: string;
      tenant_timezone: string;
      name: string;
      email: string;
      role: AuthUser['role'];
      platform_admin: boolean;
      platform_owner: boolean;
      access_profile_id: string | null;
      access_profile_name: string | null;
      platform_permissions: unknown | null;
      password_hash: string;
    }>(`
      SELECT u.id, u.tenant_id, t.name AS tenant_name, t.timezone AS tenant_timezone,
        u.name, u.email, u.role, u.password_hash,
        (pa.user_id IS NOT NULL) AS platform_admin,
        COALESCE(pa.is_owner, false) AS platform_owner,
        pa.access_profile_id,
        pap.name AS access_profile_name,
        pap.permissions AS platform_permissions
      FROM users u
      JOIN tenants t ON t.id = u.tenant_id
      LEFT JOIN platform_administrators pa ON pa.user_id = u.id
      LEFT JOIN platform_access_profiles pap ON pap.id = pa.access_profile_id AND pap.deleted_at IS NULL
      WHERE u.id = $1 AND u.tenant_id = $2 AND u.active = true AND u.deleted_at IS NULL AND t.active = true
      LIMIT 1
    `, [userId, tenantId]);
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      tenantTimezone: row.tenant_timezone,
      name: row.name,
      email: row.email,
      role: row.role,
      platformAdmin: row.platform_admin,
      platformOwner: row.platform_owner,
      platformAccessProfileId: row.access_profile_id,
      platformAccessProfileName: row.access_profile_name,
      platformPermissions: row.platform_owner ? null : normalizePlatformPermissions(row.platform_permissions),
      passwordHash: row.password_hash
    };
  }

  async updateOwnPassword(userId: string, tenantId: string, passwordHash: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`
        UPDATE users SET password_hash = $3, updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND active = true AND deleted_at IS NULL
        RETURNING id
      `, [userId, tenantId, passwordHash]);
      if (result.rowCount !== 1) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query('UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async createPasswordResetToken(input: {
    user: AuthUser;
    tokenHash: string;
    expiresAt: string;
    ipAddress: string | null;
    userAgent: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM password_reset_tokens WHERE expires_at <= now() OR used_at IS NOT NULL');
      await client.query(`
        UPDATE password_reset_tokens SET used_at = now()
        WHERE user_id = $1 AND used_at IS NULL
      `, [input.user.id]);
      await client.query(`
        INSERT INTO password_reset_tokens
          (tenant_id, user_id, token_hash, requested_ip, user_agent, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        input.user.tenantId,
        input.user.id,
        input.tokenHash,
        input.ipAddress,
        input.userAgent.slice(0, 1000),
        input.expiresAt
      ]);
      await client.query(`
        INSERT INTO auth_audit (tenant_id, user_id, email, action, ip_address, user_agent)
        VALUES ($1, $2, lower($3), 'password_reset_requested', $4, $5)
      `, [
        input.user.tenantId,
        input.user.id,
        input.user.email,
        input.ipAddress,
        input.userAgent.slice(0, 1000)
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async discardPasswordResetToken(tokenHash: string): Promise<void> {
    await this.pool.query('DELETE FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
  }

  async resetPasswordWithToken(input: {
    tokenHash: string;
    passwordHash: string;
    ipAddress: string | null;
    userAgent: string;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ user_id: string; tenant_id: string; email: string }>(`
        SELECT r.user_id, r.tenant_id, u.email
        FROM password_reset_tokens r
        JOIN users u ON u.id = r.user_id AND u.tenant_id = r.tenant_id
        JOIN tenants t ON t.id = r.tenant_id
        WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()
          AND u.active = true AND u.deleted_at IS NULL AND t.active = true
        FOR UPDATE OF r
      `, [input.tokenHash]);
      const reset = result.rows[0];
      if (!reset) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(`
        UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1
      `, [reset.user_id, input.passwordHash]);
      await client.query(`
        UPDATE password_reset_tokens SET used_at = now()
        WHERE user_id = $1 AND used_at IS NULL
      `, [reset.user_id]);
      await client.query(`
        UPDATE user_sessions SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL
      `, [reset.user_id]);
      await client.query(`
        INSERT INTO auth_audit (tenant_id, user_id, email, action, ip_address, user_agent)
        VALUES ($1, $2, lower($3), 'password_reset_completed', $4, $5)
      `, [
        reset.tenant_id,
        reset.user_id,
        reset.email,
        input.ipAddress,
        input.userAgent.slice(0, 1000)
      ]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async listUsers(tenantId: string): Promise<ManagedUser[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      email: string;
      role: AuthUser['role'];
      active: boolean;
      last_login_at: string | null;
      created_at: string;
      updated_at: string;
      platform_owner: boolean;
      access_profile_id: string | null;
      access_profile_name: string | null;
    }>(`
      SELECT u.id, u.name, u.email, u.role, u.active, u.last_login_at, u.created_at, u.updated_at,
        COALESCE(pa.is_owner, false) AS platform_owner,
        pa.access_profile_id,
        pap.name AS access_profile_name
      FROM users u
      LEFT JOIN platform_administrators pa ON pa.user_id = u.id
      LEFT JOIN platform_access_profiles pap ON pap.id = pa.access_profile_id AND pap.deleted_at IS NULL
      WHERE u.tenant_id = $1 AND u.deleted_at IS NULL
      ORDER BY u.active DESC, u.name, u.email
    `, [tenantId]);
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      active: row.active,
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      platformOwner: row.platform_owner,
      accessProfileId: row.access_profile_id,
      accessProfileName: row.access_profile_name
    }));
  }

  async listPlatformAccessProfiles(): Promise<PlatformAccessProfile[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      description: string;
      permissions: unknown;
      protected: boolean;
      assigned_users: string;
      created_at: string;
      updated_at: string;
    }>(`
      SELECT pap.id, pap.name, pap.description, pap.permissions, pap.protected,
        count(pa.user_id) FILTER (WHERE u.active = true AND u.deleted_at IS NULL)::text AS assigned_users,
        pap.created_at, pap.updated_at
      FROM platform_access_profiles pap
      LEFT JOIN platform_administrators pa ON pa.access_profile_id = pap.id
      LEFT JOIN users u ON u.id = pa.user_id
      WHERE pap.deleted_at IS NULL
      GROUP BY pap.id
      ORDER BY pap.protected DESC, lower(pap.name)
    `);
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      permissions: normalizePlatformPermissions(row.permissions),
      protected: row.protected,
      assignedUsers: Number(row.assigned_users),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    }));
  }

  async isPlatformOwner(userId: string): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT 1 FROM platform_administrators WHERE user_id = $1 AND is_owner = true
    `, [userId]);
    return result.rowCount === 1;
  }

  async createPlatformAccessProfile(input: {
    actorUserId: string;
    name: string;
    description: string;
    permissions: PlatformPermissions;
  }): Promise<PlatformAccessProfile> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        id: string; name: string; description: string; permissions: unknown; protected: boolean;
        created_at: string; updated_at: string;
      }>(`
        INSERT INTO platform_access_profiles (name, description, permissions, created_by_user_id)
        VALUES ($1, $2, $3::jsonb, $4)
        RETURNING id, name, description, permissions, protected, created_at, updated_at
      `, [input.name, input.description, JSON.stringify(input.permissions), input.actorUserId]);
      const row = result.rows[0];
      if (!row) throw new Error('Perfil não foi criado');
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, '00000000-0000-0000-0000-000000000000', 'access_profile_created', $2::jsonb)
      `, [input.actorUserId, JSON.stringify({ profileId: row.id, name: row.name, permissions: input.permissions })]);
      await client.query('COMMIT');
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        permissions: normalizePlatformPermissions(row.permissions),
        protected: row.protected,
        assignedUsers: 0,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString()
      };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async updatePlatformAccessProfile(input: {
    actorUserId: string;
    profileId: string;
    name: string;
    description: string;
    permissions: PlatformPermissions;
  }): Promise<'updated' | 'not_found' | 'protected'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{ protected: boolean }>(`
        SELECT protected FROM platform_access_profiles WHERE id = $1 AND deleted_at IS NULL FOR UPDATE
      `, [input.profileId]);
      if (!existing.rows[0]) {
        await client.query('ROLLBACK');
        return 'not_found';
      }
      if (existing.rows[0].protected) {
        await client.query('ROLLBACK');
        return 'protected';
      }
      const result = await client.query(`
        UPDATE platform_access_profiles
        SET name = $2, description = $3, permissions = $4::jsonb, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
      `, [input.profileId, input.name, input.description, JSON.stringify(input.permissions)]);
      if (result.rowCount !== 1) throw new Error('Perfil não foi atualizado');
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, '00000000-0000-0000-0000-000000000000', 'access_profile_updated', $2::jsonb)
      `, [input.actorUserId, JSON.stringify({ profileId: input.profileId, name: input.name, permissions: input.permissions })]);
      await client.query('COMMIT');
      return 'updated';
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async deletePlatformAccessProfile(input: {
    actorUserId: string;
    profileId: string;
  }): Promise<'deleted' | 'not_found' | 'protected' | 'in_use'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const profileResult = await client.query<{ name: string; protected: boolean }>(`
        SELECT name, protected FROM platform_access_profiles
        WHERE id = $1 AND deleted_at IS NULL FOR UPDATE
      `, [input.profileId]);
      const profile = profileResult.rows[0];
      if (!profile) {
        await client.query('ROLLBACK');
        return 'not_found';
      }
      if (profile.protected) {
        await client.query('ROLLBACK');
        return 'protected';
      }
      const assigned = await client.query(`
        SELECT 1 FROM platform_administrators pa
        JOIN users u ON u.id = pa.user_id
        WHERE pa.access_profile_id = $1 AND u.deleted_at IS NULL LIMIT 1
      `, [input.profileId]);
      if (assigned.rowCount) {
        await client.query('ROLLBACK');
        return 'in_use';
      }
      await client.query(`UPDATE platform_access_profiles SET deleted_at = now(), updated_at = now() WHERE id = $1`, [input.profileId]);
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, '00000000-0000-0000-0000-000000000000', 'access_profile_deleted', $2::jsonb)
      `, [input.actorUserId, JSON.stringify({ profileId: input.profileId, name: profile.name })]);
      await client.query('COMMIT');
      return 'deleted';
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async createManagedUser(input: {
    tenantId: string;
    actorUserId: string;
    name: string;
    email: string;
    role: AuthUser['role'];
    passwordHash: string;
    platformAudit?: boolean;
    platformAdministrator?: boolean;
    platformAccessProfileId?: string;
  }): Promise<ManagedUser> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        id: string; name: string; email: string; role: AuthUser['role']; active: boolean;
        last_login_at: string | null; created_at: string; updated_at: string;
      }>(`
        INSERT INTO users (tenant_id, name, email, password_hash, role, active)
        VALUES ($1, $2, lower($3), $4, $5, true)
        RETURNING id, name, email, role, active, last_login_at, created_at, updated_at
      `, [input.tenantId, input.name, input.email, input.passwordHash, input.role]);
      const row = result.rows[0];
      if (!row) throw new Error('Usuário não foi criado');
      if (input.platformAdministrator) {
        const platformGrant = await client.query(`
          INSERT INTO platform_administrators (user_id, access_profile_id, is_owner)
          SELECT $1, pap.id, false
          FROM platform_access_profiles pap
          WHERE pap.id = $2 AND pap.deleted_at IS NULL
          ON CONFLICT (user_id) DO NOTHING
        `, [row.id, input.platformAccessProfileId ?? '00000000-0000-4000-8000-000000000101']);
        if (platformGrant.rowCount !== 1) throw new Error('platform_access_profile_not_found');
      }
      await client.query(`
        INSERT INTO user_management_audit
          (tenant_id, actor_user_id, target_user_id, action, details)
        VALUES ($1, $2, $3, 'created', jsonb_build_object('role', $4::text, 'email', $5::text))
      `, [input.tenantId, input.actorUserId, row.id, row.role, row.email]);
      if (input.platformAudit) {
        await client.query(`
          INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
          VALUES ($1, $2, 'updated', $3::jsonb)
        `, [input.actorUserId, input.tenantId, JSON.stringify({
          userAction: 'created', userId: row.id, name: row.name, email: row.email, role: row.role
        })]);
      }
      await client.query('COMMIT');
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        active: row.active,
        lastLoginAt: null,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        platformOwner: false,
        accessProfileId: input.platformAdministrator
          ? input.platformAccessProfileId ?? '00000000-0000-4000-8000-000000000101'
          : null,
        accessProfileName: null
      };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateManagedUser(input: {
    tenantId: string;
    actorUserId: string;
    targetUserId: string;
    name: string;
    email?: string;
    role: AuthUser['role'];
    active: boolean;
    platformAudit?: boolean;
    platformAccessProfileId?: string;
  }): Promise<'updated' | 'not_found' | 'last_admin'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM tenants WHERE id = $1 FOR UPDATE', [input.tenantId]);
      const targetResult = await client.query<{ name: string; email: string; role: AuthUser['role']; active: boolean }>(`
        SELECT name, email, role, active FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL FOR UPDATE
      `, [input.targetUserId, input.tenantId]);
      const target = targetResult.rows[0];
      if (!target) {
        await client.query('ROLLBACK');
        return 'not_found';
      }
      if (target.active && target.role === 'admin' && (!input.active || input.role !== 'admin')) {
        const admins = await client.query<{ count: string }>(`
          SELECT count(*) AS count FROM users
          WHERE tenant_id = $1 AND active = true AND role = 'admin' AND deleted_at IS NULL
        `, [input.tenantId]);
        if (Number(admins.rows[0]?.count ?? 0) <= 1) {
          await client.query('ROLLBACK');
          return 'last_admin';
        }
      }
      const email = input.email ?? target.email;
      await client.query(`
        UPDATE users SET name = $3, role = $4, active = $5, email = lower($6), updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
      `, [input.targetUserId, input.tenantId, input.name, input.role, input.active, email]);
      if (input.platformAccessProfileId) {
        const profile = await client.query(`
          SELECT id FROM platform_access_profiles WHERE id = $1 AND deleted_at IS NULL
        `, [input.platformAccessProfileId]);
        if (profile.rowCount !== 1) {
          await client.query('ROLLBACK');
          return 'not_found';
        }
        await client.query(`
          UPDATE platform_administrators
          SET access_profile_id = $2
          WHERE user_id = $1 AND is_owner = false
        `, [input.targetUserId, input.platformAccessProfileId]);
      }
      if (!input.active) {
        await client.query('UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [input.targetUserId]);
      }
      const action = target.active !== input.active ? (input.active ? 'activated' : 'deactivated') : 'updated';
      await client.query(`
        INSERT INTO user_management_audit
          (tenant_id, actor_user_id, target_user_id, action, details)
        VALUES ($1, $2, $3, $4, jsonb_build_object('name', $5::text, 'email', $6::text, 'role', $7::text, 'active', $8::boolean))
      `, [input.tenantId, input.actorUserId, input.targetUserId, action, input.name, email, input.role, input.active]);
      if (input.platformAudit) {
        await client.query(`
          INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
          VALUES ($1, $2, 'updated', $3::jsonb)
        `, [input.actorUserId, input.tenantId, JSON.stringify({
          userAction: action,
          userId: input.targetUserId,
          previousName: target.name,
          name: input.name,
          previousEmail: target.email,
          email,
          previousRole: target.role,
          role: input.role,
          active: input.active,
          accessProfileId: input.platformAccessProfileId ?? null
        })]);
      }
      await client.query('COMMIT');
      return 'updated';
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteManagedUser(input: {
    tenantId: string;
    actorUserId: string;
    targetUserId: string;
    platformAudit?: boolean;
  }): Promise<'deleted' | 'not_found' | 'own_user' | 'last_admin'> {
    if (input.actorUserId === input.targetUserId) return 'own_user';
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM tenants WHERE id = $1 FOR UPDATE', [input.tenantId]);
      const targetResult = await client.query<{
        name: string;
        email: string;
        role: AuthUser['role'];
        active: boolean;
      }>(`
        SELECT name, email, role, active
        FROM users
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        FOR UPDATE
      `, [input.targetUserId, input.tenantId]);
      const target = targetResult.rows[0];
      if (!target) {
        await client.query('ROLLBACK');
        return 'not_found';
      }
      if (target.active && target.role === 'admin') {
        const admins = await client.query<{ count: string }>(`
          SELECT count(*) AS count
          FROM users
          WHERE tenant_id = $1 AND active = true AND role = 'admin' AND deleted_at IS NULL
        `, [input.tenantId]);
        if (Number(admins.rows[0]?.count ?? 0) <= 1) {
          await client.query('ROLLBACK');
          return 'last_admin';
        }
      }
      await client.query(`
        UPDATE users
        SET active = false, deleted_at = now(), updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
      `, [input.targetUserId, input.tenantId]);
      await client.query(
        'UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [input.targetUserId]
      );
      await client.query(`
        INSERT INTO user_management_audit
          (tenant_id, actor_user_id, target_user_id, action, details)
        VALUES (
          $1, $2, $3, 'deleted',
          jsonb_build_object('name', $4::text, 'email', $5::text, 'role', $6::text, 'activeBeforeDeletion', $7::boolean)
        )
      `, [input.tenantId, input.actorUserId, input.targetUserId, target.name, target.email, target.role, target.active]);
      if (input.platformAudit) {
        await client.query(`
          INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
          VALUES ($1, $2, 'updated', $3::jsonb)
        `, [input.actorUserId, input.tenantId, JSON.stringify({
          userAction: 'deleted', userId: input.targetUserId,
          name: target.name, email: target.email, role: target.role
        })]);
      }
      await client.query('COMMIT');
      return 'deleted';
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async createSession(input: {
    user: AuthUser;
    tokenHash: string;
    expiresAt: string;
    ipAddress: string | null;
    userAgent: string;
  }): Promise<AuthSession> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_sessions WHERE expires_at <= now() OR revoked_at IS NOT NULL');
      const result = await client.query<{ id: string; expires_at: string }>(`
        INSERT INTO user_sessions (tenant_id, user_id, token_hash, expires_at, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, expires_at
      `, [
        input.user.tenantId,
        input.user.id,
        input.tokenHash,
        input.expiresAt,
        input.ipAddress,
        input.userAgent.slice(0, 1000)
      ]);
      await client.query('UPDATE users SET last_login_at = now() WHERE id = $1', [input.user.id]);
      await client.query('COMMIT');
      const row = result.rows[0];
      if (!row) throw new Error('Sessão não foi criada');
      return {
        sessionId: row.id,
        expiresAt: new Date(row.expires_at).toISOString(),
        id: input.user.id,
        tenantId: input.user.tenantId,
        tenantName: input.user.tenantName,
        tenantTimezone: input.user.tenantTimezone,
        name: input.user.name,
        email: input.user.email,
        role: input.user.role,
        platformAdmin: input.user.platformAdmin,
        platformOwner: input.user.platformOwner ?? false,
        platformAccessProfileId: input.user.platformAccessProfileId ?? null,
        platformAccessProfileName: input.user.platformAccessProfileName ?? null,
        platformPermissions: input.user.platformPermissions ?? null,
        context: input.user.platformAdmin ? 'platform' : 'tenant',
        homeTenantId: input.user.tenantId,
        homeTenantName: input.user.tenantName,
        homeTenantTimezone: input.user.tenantTimezone
      };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async findActiveSession(tokenHash: string): Promise<AuthSession | undefined> {
    const result = await this.pool.query<{
      session_id: string;
      expires_at: string;
      id: string;
      home_tenant_id: string;
      home_tenant_name: string;
      home_tenant_timezone: string;
      active_tenant_id: string | null;
      active_tenant_name: string | null;
      active_tenant_timezone: string | null;
      name: string;
      email: string;
      role: AuthUser['role'];
      platform_admin: boolean;
      platform_owner: boolean;
      access_profile_id: string | null;
      access_profile_name: string | null;
      platform_permissions: unknown | null;
    }>(`
      SELECT
        s.id AS session_id, s.expires_at, u.id,
        u.tenant_id AS home_tenant_id,
        t.name AS home_tenant_name,
        t.timezone AS home_tenant_timezone,
        active_tenant.id AS active_tenant_id,
        active_tenant.name AS active_tenant_name,
        active_tenant.timezone AS active_tenant_timezone,
        u.name, u.email, u.role,
        (pa.user_id IS NOT NULL) AS platform_admin,
        COALESCE(pa.is_owner, false) AS platform_owner,
        pa.access_profile_id,
        pap.name AS access_profile_name,
        pap.permissions AS platform_permissions
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
      JOIN tenants t ON t.id = s.tenant_id
      LEFT JOIN platform_administrators pa ON pa.user_id = u.id
      LEFT JOIN platform_access_profiles pap ON pap.id = pa.access_profile_id AND pap.deleted_at IS NULL
      LEFT JOIN tenants active_tenant
        ON active_tenant.id = s.active_tenant_id
       AND active_tenant.active = true
       AND active_tenant.tenant_kind = 'customer'
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.active = true
        AND u.deleted_at IS NULL
        AND t.active = true
      LIMIT 1
    `, [tokenHash]);
    const row = result.rows[0];
    if (!row) return undefined;
    await this.pool.query('UPDATE user_sessions SET last_seen_at = now() WHERE id = $1', [row.session_id]);
    const tenantContext = row.platform_admin && row.active_tenant_id !== null;
    return {
      sessionId: row.session_id,
      expiresAt: new Date(row.expires_at).toISOString(),
      id: row.id,
      tenantId: tenantContext ? row.active_tenant_id! : row.home_tenant_id,
      tenantName: tenantContext ? row.active_tenant_name! : row.home_tenant_name,
      tenantTimezone: tenantContext ? row.active_tenant_timezone! : row.home_tenant_timezone,
      name: row.name,
      email: row.email,
      role: row.role,
      platformAdmin: row.platform_admin,
      platformOwner: row.platform_owner,
      platformAccessProfileId: row.access_profile_id,
      platformAccessProfileName: row.access_profile_name,
      platformPermissions: row.platform_owner ? null : normalizePlatformPermissions(row.platform_permissions),
      context: row.platform_admin && !tenantContext ? 'platform' : 'tenant',
      homeTenantId: row.home_tenant_id,
      homeTenantName: row.home_tenant_name,
      homeTenantTimezone: row.home_tenant_timezone
    };
  }

  async setPlatformSessionTenantContext(input: {
    sessionId: string;
    actorUserId: string;
    tenantId: string | null;
  }): Promise<'updated' | 'tenant_not_found' | 'forbidden'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sessionResult = await client.query<{ active_tenant_id: string | null }>(`
        SELECT s.active_tenant_id
        FROM user_sessions s
        JOIN platform_administrators pa ON pa.user_id = s.user_id
        WHERE s.id = $1 AND s.user_id = $2
          AND s.revoked_at IS NULL AND s.expires_at > now()
        FOR UPDATE
      `, [input.sessionId, input.actorUserId]);
      const current = sessionResult.rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return 'forbidden';
      }
      if (input.tenantId) {
        const target = await client.query(`
          SELECT 1 FROM tenants
          WHERE id = $1 AND tenant_kind = 'customer' AND active = true
          LIMIT 1
        `, [input.tenantId]);
        if (target.rowCount !== 1) {
          await client.query('ROLLBACK');
          return 'tenant_not_found';
        }
      }
      await client.query(`
        UPDATE user_sessions SET active_tenant_id = $2, last_seen_at = now()
        WHERE id = $1
      `, [input.sessionId, input.tenantId]);
      const auditTarget = input.tenantId ?? current.active_tenant_id;
      if (auditTarget && current.active_tenant_id !== input.tenantId) {
        await client.query(`
          INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
          VALUES ($1, $2, $3, $4::jsonb)
        `, [
          input.actorUserId,
          auditTarget,
          input.tenantId ? 'tenant_accessed' : 'tenant_access_ended',
          JSON.stringify({ sessionId: input.sessionId })
        ]);
      }
      await client.query('COMMIT');
      return 'updated';
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.pool.query('UPDATE user_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [sessionId]);
  }

  async auditAuth(input: {
    tenantId: string | null;
    userId: string | null;
    email: string;
    action: 'login_success' | 'login_failure' | 'logout' | 'password_change' | 'password_reset_requested' | 'password_reset_completed';
    ipAddress: string | null;
    userAgent: string;
  }): Promise<void> {
    await this.pool.query(`
      INSERT INTO auth_audit (tenant_id, user_id, email, action, ip_address, user_agent)
      VALUES ($1, $2, lower($3), $4, $5, $6)
    `, [
      input.tenantId,
      input.userId,
      input.email,
      input.action,
      input.ipAddress,
      input.userAgent.slice(0, 1000)
    ]);
  }

  async listDevices(tenantId: string): Promise<DeviceDefinition[]> {
    const result = await this.pool.query<{
      id: string;
      collector_id: string | null;
      name: string;
      vendor: string;
      model: string | null;
      exporter_ip: string;
      timezone: string;
      enabled: boolean;
    }>(`
      SELECT id, collector_id, name, vendor, model, host(exporter_ip) AS exporter_ip, timezone, enabled
      FROM devices
      WHERE tenant_id = $1 AND deleted_at IS NULL
      ORDER BY name
    `, [tenantId]);
    return result.rows.map((row) => ({
      id: row.id,
      collectorId: row.collector_id,
      name: row.name,
      vendor: row.vendor,
      model: row.model,
      exporterIp: row.exporter_ip,
      timezone: row.timezone,
      enabled: row.enabled
    }));
  }

  async listPlatformDevices(): Promise<PlatformDeviceDefinition[]> {
    const result = await this.pool.query<{
      id: string;
      tenant_id: string;
      tenant_name: string;
      collector_id: string | null;
      collector_name: string | null;
      name: string;
      vendor: string;
      model: string | null;
      exporter_ip: string;
      timezone: string;
      enabled: boolean;
    }>(`
      SELECT
        d.id, d.tenant_id, tenant.name AS tenant_name,
        d.collector_id, collector.name AS collector_name,
        d.name, d.vendor, d.model, host(d.exporter_ip) AS exporter_ip,
        d.timezone, d.enabled
      FROM devices d
      JOIN tenants tenant
        ON tenant.id = d.tenant_id
       AND tenant.active = true
       AND tenant.tenant_kind = 'customer'
      LEFT JOIN collectors collector
        ON collector.id = d.collector_id
       AND collector.tenant_id = d.tenant_id
       AND collector.deleted_at IS NULL
      WHERE d.deleted_at IS NULL
      ORDER BY tenant.name, d.name
    `);
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      collectorId: row.collector_id,
      collectorName: row.collector_name,
      name: row.name,
      vendor: row.vendor,
      model: row.model,
      exporterIp: row.exporter_ip,
      timezone: row.timezone,
      enabled: row.enabled
    }));
  }

  async createDeviceDiscoverySession(input: {
    tenantId: string;
    collectorId: string;
    requestedByUserId: string;
    durationSeconds: number;
  }): Promise<CreateDeviceDiscoverySessionResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const collector = await client.query<{ id: string; name: string }>(`
        SELECT id, name
        FROM collectors
        WHERE id = $1 AND tenant_id = $2 AND status <> 'disabled' AND deleted_at IS NULL
        FOR UPDATE
      `, [input.collectorId, input.tenantId]);
      if (!collector.rows[0]) {
        await client.query('ROLLBACK');
        return { status: 'collector_not_found' };
      }
      const existing = await client.query<{
        id: string; collector_id: string; collector_name: string; started_at: string; ends_at: string;
      }>(`
        SELECT s.id, s.collector_id, c.name AS collector_name, s.started_at, s.ends_at
        FROM device_discovery_sessions s
        JOIN collectors c ON c.id = s.collector_id
        WHERE s.tenant_id = $1 AND s.collector_id = $2 AND s.ends_at > now()
        ORDER BY s.started_at DESC
        LIMIT 1
      `, [input.tenantId, input.collectorId]);
      if (existing.rows[0]) {
        await client.query('COMMIT');
        return { status: 'active', session: this.mapDeviceDiscoverySession(existing.rows[0]) };
      }
      const created = await client.query<{
        id: string; collector_id: string; started_at: string; ends_at: string;
      }>(`
        INSERT INTO device_discovery_sessions
          (tenant_id, collector_id, requested_by_user_id, ends_at)
        VALUES ($1, $2, $3, now() + make_interval(secs => $4))
        RETURNING id, collector_id, started_at, ends_at
      `, [input.tenantId, input.collectorId, input.requestedByUserId, input.durationSeconds]);
      await client.query('COMMIT');
      const row = created.rows[0]!;
      return {
        status: 'created',
        session: {
          id: row.id,
          collectorId: row.collector_id,
          collectorName: collector.rows[0].name,
          startedAt: new Date(row.started_at).toISOString(),
          endsAt: new Date(row.ends_at).toISOString()
        }
      };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async getDeviceDiscoverySession(tenantId: string, sessionId: string): Promise<DeviceDiscoverySession | undefined> {
    const result = await this.pool.query<{
      id: string; collector_id: string; collector_name: string; started_at: string; ends_at: string;
    }>(`
      SELECT s.id, s.collector_id, c.name AS collector_name, s.started_at, s.ends_at
      FROM device_discovery_sessions s
      JOIN collectors c ON c.id = s.collector_id
      WHERE s.id = $1 AND s.tenant_id = $2
    `, [sessionId, tenantId]);
    return result.rows[0] ? this.mapDeviceDiscoverySession(result.rows[0]) : undefined;
  }

  async getTenantPlanUsage(tenantId: string): Promise<TenantPlanUsage> {
    const result = await this.pool.query<{
      plan_code: string | null;
      plan_name: string | null;
      device_limit: number | null;
      device_limit_override: number | null;
      devices_used: string;
    }>(`
      SELECT
        sp.code AS plan_code,
        sp.name AS plan_name,
        COALESCE(tpa.device_limit_override, sp.max_devices) AS device_limit,
        tpa.device_limit_override,
        count(d.id)::text AS devices_used
      FROM tenants t
      LEFT JOIN tenant_plan_assignments tpa ON tpa.tenant_id = t.id
      LEFT JOIN service_plans sp ON sp.id = tpa.plan_id
      LEFT JOIN devices d ON d.tenant_id = t.id AND d.deleted_at IS NULL
      WHERE t.id = $1
      GROUP BY sp.code, sp.name, tpa.device_limit_override, sp.max_devices
    `, [tenantId]);
    return this.mapTenantPlanUsage(result.rows[0]);
  }

  async listServicePlans(): Promise<ServicePlanDefinition[]> {
    const result = await this.pool.query<{
      code: string; name: string; max_devices: number | null; assigned_tenants: string;
    }>(`
      SELECT sp.code, sp.name, sp.max_devices,
        count(tpa.tenant_id)::text AS assigned_tenants
      FROM service_plans sp
      LEFT JOIN tenant_plan_assignments tpa ON tpa.plan_id = sp.id
      WHERE sp.active = true
      GROUP BY sp.id, sp.code, sp.name, sp.max_devices, sp.sort_order
      ORDER BY sp.sort_order, sp.name
    `);
    return result.rows.map((row) => ({
      code: row.code,
      name: row.name,
      deviceLimit: row.max_devices,
      assignedTenants: Number(row.assigned_tenants)
    }));
  }

  async createServicePlan(input: {
    actorUserId: string;
    name: string;
    deviceLimit: number | null;
  }): Promise<ServicePlanDefinition> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ code: string; name: string; max_devices: number | null }>(`
        INSERT INTO service_plans (code, name, max_devices, sort_order)
        VALUES ('plan_' || replace(gen_random_uuid()::text, '-', ''), $1, $2,
          COALESCE((SELECT max(sort_order) + 10 FROM service_plans), 10))
        RETURNING code, name, max_devices
      `, [input.name, input.deviceLimit]);
      const row = result.rows[0];
      if (!row) throw new Error('Plano não foi criado');
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, NULL, 'plan_created', $2::jsonb)
      `, [input.actorUserId, JSON.stringify({ planCode: row.code, name: row.name, deviceLimit: row.max_devices })]);
      await client.query('COMMIT');
      return { code: row.code, name: row.name, deviceLimit: row.max_devices, assignedTenants: 0 };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateServicePlan(input: {
    actorUserId: string;
    code: string;
    name: string;
    deviceLimit: number | null;
  }): Promise<'updated' | 'not_found' | { status: 'limit_below_usage'; devicesUsed: number }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const previousResult = await client.query<{ id: string; name: string; max_devices: number | null }>(`
        SELECT id, name, max_devices FROM service_plans
        WHERE code = $1 AND active = true FOR UPDATE
      `, [input.code]);
      const previous = previousResult.rows[0];
      if (!previous) {
        await client.query('ROLLBACK');
        return 'not_found';
      }
      const usageResult = await client.query<{ max_used: string | null }>(`
        SELECT max(devices_used)::text AS max_used
        FROM (
          SELECT count(d.id) AS devices_used
          FROM tenant_plan_assignments tpa
          LEFT JOIN devices d ON d.tenant_id = tpa.tenant_id AND d.deleted_at IS NULL
          WHERE tpa.plan_id = $1 AND tpa.device_limit_override IS NULL
          GROUP BY tpa.tenant_id
        ) usage
      `, [previous.id]);
      const devicesUsed = Number(usageResult.rows[0]?.max_used ?? 0);
      if (input.deviceLimit !== null && devicesUsed > input.deviceLimit) {
        await client.query('ROLLBACK');
        return { status: 'limit_below_usage', devicesUsed };
      }
      await client.query(`
        UPDATE service_plans SET name = $2, max_devices = $3, updated_at = now()
        WHERE code = $1 AND active = true
      `, [input.code, input.name, input.deviceLimit]);
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, NULL, 'plan_updated', $2::jsonb)
      `, [input.actorUserId, JSON.stringify({
        planCode: input.code,
        previousName: previous.name,
        name: input.name,
        previousDeviceLimit: previous.max_devices,
        deviceLimit: input.deviceLimit
      })]);
      await client.query('COMMIT');
      return 'updated';
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteServicePlan(input: {
    actorUserId: string;
    code: string;
  }): Promise<'deleted' | 'not_found' | 'plan_in_use' | 'last_active_plan'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const planResult = await client.query<{ id: string; name: string; max_devices: number | null }>(`
        SELECT id, name, max_devices FROM service_plans
        WHERE code = $1 AND active = true FOR UPDATE
      `, [input.code]);
      const plan = planResult.rows[0];
      if (!plan) {
        await client.query('ROLLBACK');
        return 'not_found';
      }
      const assignments = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM tenant_plan_assignments WHERE plan_id = $1
      `, [plan.id]);
      if (Number(assignments.rows[0]?.count ?? 0) > 0) {
        await client.query('ROLLBACK');
        return 'plan_in_use';
      }
      const activePlans = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM service_plans WHERE active = true
      `);
      if (Number(activePlans.rows[0]?.count ?? 0) <= 1) {
        await client.query('ROLLBACK');
        return 'last_active_plan';
      }
      await client.query(`UPDATE service_plans SET active = false, updated_at = now() WHERE id = $1`, [plan.id]);
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, NULL, 'plan_deleted', $2::jsonb)
      `, [input.actorUserId, JSON.stringify({ planCode: input.code, name: plan.name, deviceLimit: plan.max_devices })]);
      await client.query('COMMIT');
      return 'deleted';
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async listPlatformTenants(): Promise<PlatformTenantRecord[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      timezone: string;
      active: boolean;
      logo_configured: boolean;
      created_at: string;
      plan_code: string | null;
      plan_name: string | null;
      device_limit: number | null;
      device_limit_override: number | null;
      devices_used: string;
      collector_count: string;
      enabled_collector_count: string;
      connected_collector_count: string;
      enabled_device_count: string;
      user_count: string;
      deletion_job_id: string | null;
      deletion_status: PlatformTenantRecord['deletionStatus'];
    }>(`
      SELECT
        t.id, t.name, t.timezone, t.active, t.created_at,
        EXISTS (
          SELECT 1
          FROM tenant_company_profiles profile
          WHERE profile.tenant_id = t.id AND profile.logo_data IS NOT NULL
        ) AS logo_configured,
        sp.code AS plan_code,
        sp.name AS plan_name,
        COALESCE(tpa.device_limit_override, sp.max_devices) AS device_limit,
        tpa.device_limit_override,
        (SELECT count(*)::text FROM devices d WHERE d.tenant_id = t.id AND d.deleted_at IS NULL) AS devices_used,
        (SELECT count(*)::text FROM collectors c WHERE c.tenant_id = t.id AND c.deleted_at IS NULL) AS collector_count,
        (SELECT count(*)::text FROM collectors c WHERE c.tenant_id = t.id AND c.deleted_at IS NULL AND c.status <> 'disabled') AS enabled_collector_count,
        (SELECT count(*)::text
         FROM collectors c
         JOIN collector_telemetry ct ON ct.collector_id = c.id AND ct.tenant_id = c.tenant_id
         WHERE c.tenant_id = t.id AND c.deleted_at IS NULL AND c.status <> 'disabled'
           AND ct.received_at >= now() - INTERVAL '30 seconds') AS connected_collector_count,
        (SELECT count(*)::text FROM devices d WHERE d.tenant_id = t.id AND d.deleted_at IS NULL AND d.enabled = true) AS enabled_device_count,
        (SELECT count(*)::text FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS user_count,
        deletion.id AS deletion_job_id,
        deletion.status AS deletion_status
      FROM tenants t
      LEFT JOIN tenant_plan_assignments tpa ON tpa.tenant_id = t.id
      LEFT JOIN service_plans sp ON sp.id = tpa.plan_id
      LEFT JOIN LATERAL (
        SELECT id, status
        FROM tenant_deletion_jobs j
        WHERE j.tenant_id = t.id AND j.status IN ('pending', 'running', 'failed')
        ORDER BY j.requested_at DESC
        LIMIT 1
      ) deletion ON true
      WHERE t.tenant_kind = 'customer'
      ORDER BY t.active DESC, t.name, t.created_at
    `);
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      active: row.active,
      logoConfigured: row.logo_configured,
      createdAt: new Date(row.created_at).toISOString(),
      plan: this.mapTenantPlanUsage(row),
      deviceLimitOverride: row.device_limit_override,
      collectorCount: Number(row.collector_count),
      enabledCollectorCount: Number(row.enabled_collector_count),
      connectedCollectorCount: Number(row.connected_collector_count),
      enabledDeviceCount: Number(row.enabled_device_count),
      userCount: Number(row.user_count),
      deletionJobId: row.deletion_job_id,
      deletionStatus: row.deletion_status
    }));
  }

  async createPlatformTenant(input: {
    actorUserId: string;
    name: string;
    timezone: string;
    planCode: string;
    deviceLimitOverride: number | null;
    adminName: string;
    adminEmail: string;
    adminPasswordHash: string;
    companyProfile?: CompanyProfileFields;
    logoData?: Buffer | null;
    logoMime?: 'image/png' | 'image/jpeg' | null;
  }): Promise<CreatePlatformTenantResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const planResult = await client.query<{ id: string; max_devices: number | null }>(`
        SELECT id, max_devices FROM service_plans WHERE code = $1 AND active = true FOR SHARE
      `, [input.planCode]);
      const plan = planResult.rows[0];
      if (!plan) {
        await client.query('ROLLBACK');
        return { status: 'plan_not_found' };
      }
      const tenantResult = await client.query<{ id: string }>(`
        INSERT INTO tenants (name, timezone, active)
        VALUES ($1, $2, true)
        RETURNING id
      `, [input.name, input.timezone]);
      const tenantId = tenantResult.rows[0]?.id;
      if (!tenantId) throw new Error('Tenant não foi criado');
      const override = input.deviceLimitOverride;
      await client.query(`
        INSERT INTO tenant_plan_assignments (tenant_id, plan_id, device_limit_override)
        VALUES ($1, $2, $3)
      `, [tenantId, plan.id, override]);
      const userResult = await client.query<{ id: string }>(`
        INSERT INTO users (tenant_id, name, email, password_hash, role, active)
        VALUES ($1, $2, lower($3), $4, 'admin', true)
        RETURNING id
      `, [tenantId, input.adminName, input.adminEmail, input.adminPasswordHash]);
      const adminUserId = userResult.rows[0]?.id;
      if (!adminUserId) throw new Error('Administrador do tenant não foi criado');
      if (input.companyProfile) {
        const profile = input.companyProfile;
        await client.query(`
          INSERT INTO tenant_company_profiles
            (tenant_id, legal_name, trade_name, cnpj, phone, email, postal_code, street,
              address_number, complement, district, city, state, logo_data, logo_mime, updated_by_user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        `, [tenantId, profile.legalName, profile.tradeName, profile.cnpj, profile.phone, profile.email,
          profile.postalCode, profile.street, profile.addressNumber, profile.complement, profile.district,
          profile.city, profile.state, input.logoData ?? null, input.logoMime ?? null, input.actorUserId]);
      }
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, $2, 'created', $3::jsonb)
      `, [input.actorUserId, tenantId, JSON.stringify({
        name: input.name,
        planCode: input.planCode,
        deviceLimitOverride: override,
        adminEmail: input.adminEmail.toLowerCase()
      })]);
      await client.query('COMMIT');
      return { status: 'created', tenantId, adminUserId };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async updatePlatformTenant(input: {
    actorUserId: string;
    tenantId: string;
    name: string;
    timezone?: string;
    active: boolean;
    planCode: string;
    deviceLimitOverride: number | null;
  }): Promise<UpdatePlatformTenantResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const previousResult = await client.query<{
        name: string;
        timezone: string;
        active: boolean;
        plan_code: string | null;
        device_limit: number | null;
      }>(`
        SELECT t.name, t.timezone, t.active, sp.code AS plan_code,
          COALESCE(tpa.device_limit_override, sp.max_devices) AS device_limit
        FROM tenants t
        LEFT JOIN tenant_plan_assignments tpa ON tpa.tenant_id = t.id
        LEFT JOIN service_plans sp ON sp.id = tpa.plan_id
        WHERE t.id = $1
        FOR UPDATE OF t
      `, [input.tenantId]);
      const previous = previousResult.rows[0];
      if (!previous) {
        await client.query('ROLLBACK');
        return { status: 'tenant_not_found' };
      }
      const planResult = await client.query<{ id: string; max_devices: number | null }>(`
        SELECT id, max_devices FROM service_plans WHERE code = $1 AND active = true FOR SHARE
      `, [input.planCode]);
      const plan = planResult.rows[0];
      if (!plan) {
        await client.query('ROLLBACK');
        return { status: 'plan_not_found' };
      }
      const countResult = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM devices WHERE tenant_id = $1 AND deleted_at IS NULL
      `, [input.tenantId]);
      const devicesUsed = Number(countResult.rows[0]?.count ?? 0);
      const override = input.deviceLimitOverride;
      const effectiveLimit = override ?? plan.max_devices;
      if (effectiveLimit !== null && devicesUsed > effectiveLimit) {
        await client.query('ROLLBACK');
        return { status: 'limit_below_usage', devicesUsed };
      }
      const timezone = input.timezone ?? previous.timezone;
      await client.query(`
        UPDATE tenants SET name = $2, active = $3, timezone = $4, updated_at = now() WHERE id = $1
      `, [input.tenantId, input.name, input.active, timezone]);
      await client.query(`
        INSERT INTO tenant_plan_assignments (tenant_id, plan_id, device_limit_override, updated_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (tenant_id) DO UPDATE SET
          plan_id = excluded.plan_id,
          device_limit_override = excluded.device_limit_override,
          updated_at = now()
      `, [input.tenantId, plan.id, override]);
      if (previous.active && !input.active) {
        await client.query(`
          UPDATE user_sessions SET revoked_at = now()
          WHERE tenant_id = $1 AND revoked_at IS NULL
        `, [input.tenantId]);
      }
      const action = previous.active !== input.active
        ? (input.active ? 'activated' : 'deactivated')
        : previous.plan_code !== input.planCode || previous.device_limit !== effectiveLimit
          ? 'plan_changed'
          : 'updated';
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, $2, $3, $4::jsonb)
      `, [input.actorUserId, input.tenantId, action, JSON.stringify({
        previousName: previous.name,
        name: input.name,
        previousTimezone: previous.timezone,
        timezone,
        previousPlanCode: previous.plan_code,
        planCode: input.planCode,
        previousDeviceLimit: previous.device_limit,
        deviceLimit: effectiveLimit,
        active: input.active
      })]);
      await client.query('COMMIT');
      return { status: 'updated' };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async resetPlatformTenantAdministratorPassword(input: {
    actorUserId: string;
    tenantId: string;
    targetUserId: string;
    passwordHash: string;
    platformAudit?: boolean;
  }): Promise<'updated' | 'not_found'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const targetResult = await client.query<{
        tenant_name: string;
        name: string;
        email: string;
      }>(`
        SELECT t.name AS tenant_name, u.name, u.email
        FROM users u
        JOIN tenants t ON t.id = u.tenant_id
        WHERE u.id = $1 AND u.tenant_id = $2 AND u.deleted_at IS NULL
        FOR UPDATE OF u
      `, [input.targetUserId, input.tenantId]);
      const target = targetResult.rows[0];
      if (!target) {
        await client.query('ROLLBACK');
        return 'not_found';
      }
      await client.query(`
        UPDATE users SET password_hash = $3, updated_at = now()
        WHERE id = $1 AND tenant_id = $2
      `, [input.targetUserId, input.tenantId, input.passwordHash]);
      await client.query(`
        UPDATE user_sessions SET revoked_at = now()
        WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL
      `, [input.targetUserId, input.tenantId]);
      await client.query(`
        UPDATE password_reset_tokens SET used_at = now()
        WHERE user_id = $1 AND used_at IS NULL
      `, [input.targetUserId]);
      await client.query(`
        INSERT INTO user_management_audit
          (tenant_id, actor_user_id, target_user_id, action, details)
        VALUES ($1, $2, $3, 'updated', jsonb_build_object('passwordReset', true, 'sessionsRevoked', true))
      `, [input.tenantId, input.actorUserId, input.targetUserId]);
      if (input.platformAudit !== false) {
        await client.query(`
          INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
          VALUES ($1, $2, 'updated', $3::jsonb)
        `, [input.actorUserId, input.tenantId, JSON.stringify({
          name: target.tenant_name,
          passwordReset: true,
          userAction: 'password_reset',
          userId: input.targetUserId,
          userName: target.name,
          userEmail: target.email,
          sessionsRevoked: true
        })]);
      }
      await client.query('COMMIT');
      return 'updated';
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async requestTenantDeletion(input: {
    actorUserId: string;
    tenantId: string;
    confirmation: string;
  }): Promise<
    | { status: 'queued'; jobId: string }
    | { status: 'tenant_not_found' }
    | { status: 'confirmation_mismatch'; tenantName: string }
    | { status: 'already_queued'; jobId: string }
  > {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tenantResult = await client.query<{ name: string }>(`
        SELECT name FROM tenants WHERE id = $1 FOR UPDATE
      `, [input.tenantId]);
      const tenant = tenantResult.rows[0];
      if (!tenant) {
        await client.query('ROLLBACK');
        return { status: 'tenant_not_found' };
      }
      if (input.confirmation !== tenant.name) {
        await client.query('ROLLBACK');
        return { status: 'confirmation_mismatch', tenantName: tenant.name };
      }
      const existing = await client.query<{ id: string }>(`
        SELECT id FROM tenant_deletion_jobs
        WHERE tenant_id = $1 AND status IN ('pending', 'running')
        ORDER BY requested_at DESC LIMIT 1
      `, [input.tenantId]);
      if (existing.rows[0]) {
        await client.query('ROLLBACK');
        return { status: 'already_queued', jobId: existing.rows[0].id };
      }
      await client.query(`UPDATE tenants SET active = false, updated_at = now() WHERE id = $1`, [input.tenantId]);
      await client.query(`
        UPDATE user_sessions SET revoked_at = now()
        WHERE tenant_id = $1 AND revoked_at IS NULL
      `, [input.tenantId]);
      const jobResult = await client.query<{ id: string }>(`
        INSERT INTO tenant_deletion_jobs
          (tenant_id, tenant_fingerprint, tenant_name, requested_by_user_id, status)
        VALUES ($1::uuid, encode(digest(($1::uuid)::text, 'sha256'), 'hex'), $2, $3, 'pending')
        RETURNING id
      `, [input.tenantId, tenant.name, input.actorUserId]);
      const jobId = jobResult.rows[0]?.id;
      if (!jobId) throw new Error('Solicitação de exclusão não foi criada');
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, $2, 'tenant_deletion_requested', $3::jsonb)
      `, [input.actorUserId, input.tenantId, JSON.stringify({ jobId })]);
      await client.query('COMMIT');
      return { status: 'queued', jobId };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async recoverInterruptedTenantDeletions(): Promise<number> {
    const result = await this.pool.query(`
      UPDATE tenant_deletion_jobs
      SET status = 'pending', started_at = NULL,
        error_message = 'Processamento interrompido por reinício da API; reagendado automaticamente.'
      WHERE status = 'running'
    `);
    return result.rowCount ?? 0;
  }

  async claimNextTenantDeletion(): Promise<TenantDeletionJob | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        id: string; tenant_id: string; tenant_name: string; requested_by_user_id: string; status: TenantDeletionJob['status'];
      }>(`
        SELECT id, tenant_id, tenant_name, requested_by_user_id, status
        FROM tenant_deletion_jobs
        WHERE status = 'pending' AND tenant_id IS NOT NULL
        ORDER BY requested_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
      const row = result.rows[0];
      if (!row) {
        await client.query('COMMIT');
        return undefined;
      }
      await client.query(`
        UPDATE tenant_deletion_jobs
        SET status = 'running', started_at = now(), error_message = ''
        WHERE id = $1
      `, [row.id]);
      await client.query('COMMIT');
      return {
        id: row.id,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        requestedByUserId: row.requested_by_user_id,
        status: 'running'
      };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async retryTenantDeletion(jobId: string): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE tenant_deletion_jobs j
      SET status = 'pending', started_at = NULL, completed_at = NULL, error_message = ''
      WHERE j.id = $1 AND j.status = 'failed' AND j.tenant_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = j.tenant_id)
    `, [jobId]);
    return result.rowCount === 1;
  }

  async failTenantDeletion(jobId: string, errorMessage: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ requested_by_user_id: string; tenant_id: string }>(`
        UPDATE tenant_deletion_jobs
        SET status = 'failed', error_message = $2, completed_at = now()
        WHERE id = $1 AND status = 'running'
        RETURNING requested_by_user_id, tenant_id
      `, [jobId, errorMessage.slice(0, 4000)]);
      const row = result.rows[0];
      if (row) {
        await client.query(`
          INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
          VALUES ($1, $2, 'tenant_deletion_failed', $3::jsonb)
        `, [row.requested_by_user_id, row.tenant_id, JSON.stringify({ jobId, error: errorMessage.slice(0, 1000) })]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async completeTenantDeletion(input: {
    jobId: string;
    rawRowsDeleted: number;
    eventRowsDeleted: number;
    backupRetentionDays: number;
    remoteBackupConfigured: boolean;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const jobResult = await client.query<{
        tenant_id: string;
        tenant_fingerprint: string;
        requested_by_user_id: string;
      }>(`
        SELECT tenant_id, tenant_fingerprint, requested_by_user_id
        FROM tenant_deletion_jobs
        WHERE id = $1 AND status = 'running' AND tenant_id IS NOT NULL
        FOR UPDATE
      `, [input.jobId]);
      const job = jobResult.rows[0];
      if (!job) {
        await client.query('ROLLBACK');
        return false;
      }
      const tenantId = job.tenant_id;
      await client.query(`
        DELETE FROM platform_management_audit
        WHERE target_tenant_id = $1
          OR actor_user_id IN (SELECT id FROM users WHERE tenant_id = $1)
      `, [tenantId]);
      await client.query(`DELETE FROM official_report_jobs WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM export_audit WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM system_backup_audit WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM user_management_audit WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM device_management_audit WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM collector_management_audit WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM auth_audit WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM query_audit WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM collector_telemetry WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM sync_batches WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM user_sessions WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM device_discovery_sessions WHERE tenant_id = $1`, [tenantId]);
      await client.query(`
        DELETE FROM platform_administrators
        WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)
      `, [tenantId]);
      await client.query(`DELETE FROM devices WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM collectors WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM erp_integrations WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM tenant_plan_assignments WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM tenant_company_profiles WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM users WHERE tenant_id = $1`, [tenantId]);
      const tenantResult = await client.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
      if (tenantResult.rowCount !== 1) throw new Error('Tenant não encontrado durante a conclusão da exclusão');
      await client.query(`
        UPDATE tenant_deletion_jobs
        SET tenant_id = NULL, tenant_name = '[removido]', status = 'completed',
          raw_rows_deleted = $2, event_rows_deleted = $3,
          error_message = '', completed_at = now()
        WHERE id = $1
      `, [input.jobId, input.rawRowsDeleted, input.eventRowsDeleted]);
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, NULL, 'tenant_deleted', $2::jsonb)
      `, [job.requested_by_user_id, JSON.stringify({
        jobId: input.jobId,
        tenantFingerprint: job.tenant_fingerprint,
        rawRowsDeleted: input.rawRowsDeleted,
        eventRowsDeleted: input.eventRowsDeleted,
        liveDataRemoved: true,
        localBackupRetentionDays: input.backupRetentionDays,
        remoteBackupConfigured: input.remoteBackupConfigured
      })]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async listPlatformAuditEvents(input: PlatformAuditFilters): Promise<PlatformAuditEvent[]> {
    const result = await this.pool.query<{
      id: string;
      target_tenant_id: string | null;
      target_tenant_name: string | null;
      actor_name: string;
      actor_email: string;
      action: PlatformAuditAction;
      details: Record<string, unknown>;
      created_at: string;
    }>(`
      SELECT
        a.id,
        a.target_tenant_id,
        t.name AS target_tenant_name,
        actor.name AS actor_name,
        actor.email AS actor_email,
        a.action,
        a.details,
        a.created_at
      FROM platform_management_audit a
      JOIN users actor ON actor.id = a.actor_user_id
      LEFT JOIN tenants t ON t.id = a.target_tenant_id
      WHERE ($1::uuid IS NULL OR a.target_tenant_id = $1::uuid)
        AND ($2::text IS NULL OR a.action = $2::text)
        AND ($3::timestamptz IS NULL OR a.created_at >= $3::timestamptz)
        AND ($4::timestamptz IS NULL OR a.created_at <= $4::timestamptz)
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $5
    `, [input.tenantId, input.action, input.from, input.to, input.limit]);
    return result.rows.map((row) => ({
      id: row.id,
      targetTenantId: row.target_tenant_id,
      targetTenantName: row.target_tenant_name,
      actorName: row.actor_name,
      actorEmail: row.actor_email,
      action: row.action,
      details: row.details,
      createdAt: new Date(row.created_at).toISOString()
    }));
  }

  async getPlatformAuditSummary(): Promise<{
    events24h: number;
    created24h: number;
    planChanges24h: number;
    accessChanges24h: number;
    exports24h: number;
  }> {
    const result = await this.pool.query<{
      events_24h: string;
      created_24h: string;
      plan_changes_24h: string;
      access_changes_24h: string;
      exports_24h: string;
    }>(`
      SELECT
        count(*) FILTER (WHERE created_at >= now() - INTERVAL '24 hours')::text AS events_24h,
        count(*) FILTER (WHERE action = 'created' AND created_at >= now() - INTERVAL '24 hours')::text AS created_24h,
        count(*) FILTER (WHERE action = 'plan_changed' AND created_at >= now() - INTERVAL '24 hours')::text AS plan_changes_24h,
        count(*) FILTER (WHERE action IN ('activated', 'deactivated', 'tenant_accessed', 'tenant_access_ended') AND created_at >= now() - INTERVAL '24 hours')::text AS access_changes_24h,
        count(*) FILTER (WHERE action = 'exported' AND created_at >= now() - INTERVAL '24 hours')::text AS exports_24h
      FROM platform_management_audit
    `);
    const row = result.rows[0];
    return {
      events24h: Number(row?.events_24h ?? 0),
      created24h: Number(row?.created_24h ?? 0),
      planChanges24h: Number(row?.plan_changes_24h ?? 0),
      accessChanges24h: Number(row?.access_changes_24h ?? 0),
      exports24h: Number(row?.exports_24h ?? 0)
    };
  }

  async recordPlatformAuditExport(input: {
    actorUserId: string;
    targetTenantId: string | null;
    filters: Omit<PlatformAuditFilters, 'limit'>;
    resultCount: number;
    sha256: string;
  }): Promise<void> {
    await this.pool.query(`
      INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
      VALUES ($1, $2, 'exported', $3::jsonb)
    `, [input.actorUserId, input.targetTenantId, JSON.stringify({
      ...input.filters,
      resultCount: input.resultCount,
      sha256: input.sha256,
      format: 'csv'
    })]);
  }

  async listCollectorDeviceConfiguration(tenantId: string, collectorId: string): Promise<CollectorDeviceConfiguration[]> {
    const result = await this.pool.query<{
      exporter_ip: string;
      device_id: string;
      vendor: string;
      timezone: string;
    }>(`
      SELECT host(exporter_ip) AS exporter_ip, id AS device_id, vendor, timezone
      FROM devices
      WHERE tenant_id = $1 AND collector_id = $2 AND enabled = true AND deleted_at IS NULL
      ORDER BY exporter_ip
    `, [tenantId, collectorId]);
    return result.rows.map((row) => ({
      exporterIp: row.exporter_ip,
      deviceId: row.device_id,
      vendor: row.vendor,
      timezone: row.timezone
    }));
  }

  async listManagedCloudCollectorConfiguration(useSecondaryPorts = false): Promise<ManagedCloudCollectorConfiguration[]> {
    const result = await this.pool.query<{
      tenant_id: string;
      collector_id: string;
      collector_name: string;
      netflow_port: number;
      syslog_port: number;
      secondary_netflow_port: number;
      secondary_syslog_port: number;
      exporter_ip: string | null;
      device_id: string | null;
      vendor: string | null;
      timezone: string | null;
    }>(`
      SELECT
        c.tenant_id,
        c.id AS collector_id,
        c.name AS collector_name,
        c.netflow_port,
        c.syslog_port,
        c.secondary_netflow_port,
        c.secondary_syslog_port,
        host(d.exporter_ip) AS exporter_ip,
        d.id AS device_id,
        d.vendor,
        d.timezone
      FROM collectors c
      JOIN tenants t ON t.id = c.tenant_id AND t.active = true
      LEFT JOIN devices d
        ON d.collector_id = c.id AND d.tenant_id = c.tenant_id
        AND d.enabled = true AND d.deleted_at IS NULL
      WHERE c.mode = 'cloud' AND c.status <> 'disabled'
        AND c.deleted_at IS NULL
        AND c.netflow_port IS NOT NULL AND c.syslog_port IS NOT NULL
        AND c.secondary_netflow_port IS NOT NULL AND c.secondary_syslog_port IS NOT NULL
      ORDER BY c.netflow_port, d.exporter_ip
    `);
    const policyResult = await this.pool.query<{
      collector_id: string;
      mode: FirewallMode;
      updated_at: string;
      allowed_sources: string[];
    }>(`
      SELECT
        c.id AS collector_id,
        COALESCE(p.mode, 'monitor') AS mode,
        COALESCE(p.updated_at, c.created_at) AS updated_at,
        COALESCE(array_agg(a.source_cidr::text ORDER BY a.source_cidr::text)
          FILTER (WHERE a.id IS NOT NULL), ARRAY[]::text[]) AS allowed_sources
      FROM collectors c
      LEFT JOIN collector_firewall_policies p ON p.collector_id = c.id AND p.tenant_id = c.tenant_id
      LEFT JOIN collector_firewall_authorizations a ON a.collector_id = c.id AND a.tenant_id = c.tenant_id
      WHERE c.mode = 'cloud' AND c.status <> 'disabled' AND c.deleted_at IS NULL
      GROUP BY c.id, p.mode, p.updated_at, c.created_at
    `);
    const policies = new Map(policyResult.rows.map((row) => [row.collector_id, row]));
    const collectors = new Map<string, ManagedCloudCollectorConfiguration>();
    for (const row of result.rows) {
      let collector = collectors.get(row.collector_id);
      if (!collector) {
        const policy = policies.get(row.collector_id);
        collector = {
          tenantId: row.tenant_id,
          collectorId: row.collector_id,
          name: row.collector_name,
          netflowPort: Number(useSecondaryPorts ? row.secondary_netflow_port : row.netflow_port),
          syslogPort: Number(useSecondaryPorts ? row.secondary_syslog_port : row.syslog_port),
          firewall: {
            mode: policy?.mode ?? 'monitor',
            allowedSources: policy?.allowed_sources ?? [],
            updatedAt: new Date(policy?.updated_at ?? 0).toISOString()
          },
          devices: []
        };
        collectors.set(row.collector_id, collector);
      }
      if (row.exporter_ip && row.device_id && row.vendor && row.timezone) {
        collector.devices.push({
          exporterIp: row.exporter_ip,
          deviceId: row.device_id,
          vendor: row.vendor,
          timezone: row.timezone
        });
      }
    }
    return [...collectors.values()];
  }

  async touchManagedCloudCollectors(input: {
    version: string;
    sampledAt: string;
    collectorTelemetry: ManagedCloudCollectorTelemetry[];
    firewallObservations: FirewallObservation[];
    appliedFirewallPolicies: AppliedFirewallPolicy[];
    hostMetrics?: HostMetrics;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE collectors
        SET last_seen_at = now(), version = $1, status = 'online'
        WHERE mode = 'cloud' AND status <> 'disabled' AND deleted_at IS NULL
      `, [input.version]);
      await client.query(`
        UPDATE collector_telemetry telemetry
        SET
          version = $1,
          sent_at = $2,
          received_at = now(),
          host_name = $3,
          host_platform = $4,
          host_uptime_seconds = $5,
          cpu_usage_percent = $6,
          memory_total_bytes = $7,
          memory_used_bytes = $8,
          disk_total_bytes = $9,
          disk_used_bytes = $10
        FROM collectors c
        WHERE c.id = telemetry.collector_id
          AND c.mode = 'cloud' AND c.status <> 'disabled' AND c.deleted_at IS NULL
      `, [
        input.version,
        input.sampledAt,
        input.hostMetrics?.hostname ?? null,
        input.hostMetrics?.platform ?? null,
        input.hostMetrics?.uptimeSeconds ?? null,
        input.hostMetrics?.cpuUsagePercent ?? null,
        input.hostMetrics?.memoryTotalBytes ?? null,
        input.hostMetrics?.memoryUsedBytes ?? null,
        input.hostMetrics?.diskTotalBytes ?? null,
        input.hostMetrics?.diskUsedBytes ?? null
      ]);
      await client.query(`
        WITH reported AS (
          SELECT *
          FROM jsonb_to_recordset($3::jsonb) AS x(
            "tenantId" uuid,
            "collectorId" uuid,
            "pendingRecords" bigint,
            "pendingEvents" bigint,
            "pendingBatches" bigint,
            "acknowledgedRecordsRetained" bigint,
            "oldestPendingAt" timestamptz,
            "spoolBytes" bigint,
            "lastSyncAt" timestamptz,
            "lastSyncError" text
          )
        )
        INSERT INTO collector_telemetry
          (collector_id, tenant_id, version, sent_at, received_at, pending_records,
           pending_events, pending_batches, acknowledged_records_retained,
           oldest_pending_at, spool_bytes, last_sync_at, last_sync_error,
           host_name, host_platform, host_uptime_seconds, cpu_usage_percent,
           memory_total_bytes, memory_used_bytes, disk_total_bytes, disk_used_bytes)
        SELECT
          c.id, c.tenant_id, $1, $2, now(),
          reported."pendingRecords", reported."pendingEvents", reported."pendingBatches",
          reported."acknowledgedRecordsRetained", reported."oldestPendingAt",
          reported."spoolBytes", reported."lastSyncAt", reported."lastSyncError",
          $4, $5, $6, $7, $8, $9, $10, $11
        FROM reported
        JOIN collectors c
          ON c.id = reported."collectorId" AND c.tenant_id = reported."tenantId"
        WHERE c.mode = 'cloud' AND c.status <> 'disabled' AND c.deleted_at IS NULL
        ON CONFLICT (collector_id) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          version = excluded.version,
          sent_at = excluded.sent_at,
          received_at = now(),
          pending_records = excluded.pending_records,
          pending_events = excluded.pending_events,
          pending_batches = excluded.pending_batches,
          acknowledged_records_retained = excluded.acknowledged_records_retained,
          oldest_pending_at = excluded.oldest_pending_at,
          spool_bytes = excluded.spool_bytes,
          last_sync_at = excluded.last_sync_at,
          last_sync_error = excluded.last_sync_error,
          host_name = excluded.host_name,
          host_platform = excluded.host_platform,
          host_uptime_seconds = excluded.host_uptime_seconds,
          cpu_usage_percent = excluded.cpu_usage_percent,
          memory_total_bytes = excluded.memory_total_bytes,
          memory_used_bytes = excluded.memory_used_bytes,
          disk_total_bytes = excluded.disk_total_bytes,
          disk_used_bytes = excluded.disk_used_bytes
      `, [
        input.version,
        input.sampledAt,
        JSON.stringify(input.collectorTelemetry),
        input.hostMetrics?.hostname ?? null,
        input.hostMetrics?.platform ?? null,
        input.hostMetrics?.uptimeSeconds ?? null,
        input.hostMetrics?.cpuUsagePercent ?? null,
        input.hostMetrics?.memoryTotalBytes ?? null,
        input.hostMetrics?.memoryUsedBytes ?? null,
        input.hostMetrics?.diskTotalBytes ?? null,
        input.hostMetrics?.diskUsedBytes ?? null
      ]);
      if (input.firewallObservations.length) {
        await client.query(`
          WITH reported AS (
            SELECT *
            FROM jsonb_to_recordset($1::jsonb) AS x(
              "tenantId" uuid,
              "collectorId" uuid,
              "sourceIp" inet,
              "sourceType" text,
              "firstSeenAt" timestamptz,
              "lastSeenAt" timestamptz,
              "packetCount" bigint,
              "blockedPacketCount" bigint
            )
          )
          INSERT INTO collector_firewall_observations
            (collector_id, tenant_id, source_ip, source_type, first_seen_at, last_seen_at,
             packet_count, blocked_packet_count)
          SELECT
            c.id, c.tenant_id, reported."sourceIp", reported."sourceType",
            reported."firstSeenAt", reported."lastSeenAt",
            reported."packetCount", reported."blockedPacketCount"
          FROM reported
          JOIN collectors c
            ON c.id = reported."collectorId" AND c.tenant_id = reported."tenantId"
          WHERE c.mode = 'cloud' AND c.deleted_at IS NULL
          ON CONFLICT (collector_id, source_ip, source_type) DO UPDATE SET
            first_seen_at = LEAST(collector_firewall_observations.first_seen_at, excluded.first_seen_at),
            last_seen_at = GREATEST(collector_firewall_observations.last_seen_at, excluded.last_seen_at),
            packet_count = collector_firewall_observations.packet_count + excluded.packet_count,
            blocked_packet_count = collector_firewall_observations.blocked_packet_count + excluded.blocked_packet_count
        `, [JSON.stringify(input.firewallObservations)]);
      }
      if (input.appliedFirewallPolicies.length) {
        await client.query(`
          WITH reported AS (
            SELECT *
            FROM jsonb_to_recordset($1::jsonb) AS x(
              "tenantId" uuid,
              "collectorId" uuid,
              "mode" text,
              "policyUpdatedAt" timestamptz
            )
          )
          UPDATE collector_firewall_policies policy
          SET applied_mode = reported."mode",
              applied_policy_updated_at = reported."policyUpdatedAt",
              applied_at = now()
          FROM reported
          WHERE policy.collector_id = reported."collectorId"
            AND policy.tenant_id = reported."tenantId"
        `, [JSON.stringify(input.appliedFirewallPolicies)]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async isActiveManagedCloudCollector(tenantId: string, collectorId: string): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT 1 FROM collectors c
      JOIN tenants t ON t.id = c.tenant_id AND t.active = true
      WHERE c.id = $1 AND c.tenant_id = $2 AND c.mode = 'cloud'
        AND c.status <> 'disabled' AND c.deleted_at IS NULL
      LIMIT 1
    `, [collectorId, tenantId]);
    return result.rowCount === 1;
  }

  async listFirewallCollectors(tenantId: string | null): Promise<FirewallCollectorRecord[]> {
    const collectorResult = await this.pool.query<{
      id: string;
      tenant_id: string;
      tenant_name: string;
      name: string;
      collector_mode: 'edge' | 'cloud';
      configured_status: string;
      netflow_port: number | null;
      syslog_port: number | null;
      secondary_netflow_port: number | null;
      secondary_syslog_port: number | null;
      policy_mode: FirewallMode | null;
      policy_updated_at: string | null;
      applied_mode: FirewallMode | null;
      applied_policy_updated_at: string | null;
      applied_at: string | null;
    }>(`
      SELECT
        c.id, c.tenant_id, t.name AS tenant_name, c.name, c.mode AS collector_mode,
        c.status AS configured_status, c.netflow_port, c.syslog_port,
        c.secondary_netflow_port, c.secondary_syslog_port,
        p.mode AS policy_mode, p.updated_at AS policy_updated_at,
        p.applied_mode, p.applied_policy_updated_at, p.applied_at
      FROM collectors c
      JOIN tenants t ON t.id = c.tenant_id AND t.active = true
      LEFT JOIN collector_firewall_policies p
        ON p.collector_id = c.id AND p.tenant_id = c.tenant_id
      WHERE c.deleted_at IS NULL AND ($1::uuid IS NULL OR c.tenant_id = $1)
      ORDER BY t.name, c.name
    `, [tenantId]);
    const collectorIds = collectorResult.rows.map((row) => row.id);
    const authorizations = collectorIds.length
      ? await this.pool.query<{
          id: string; collector_id: string; source_cidr: string; description: string; created_at: string;
        }>(`
          SELECT id, collector_id, source_cidr::text AS source_cidr, description, created_at
          FROM collector_firewall_authorizations
          WHERE collector_id = ANY($1::uuid[])
          ORDER BY source_cidr::text
        `, [collectorIds])
      : { rows: [] };
    const observations = collectorIds.length
      ? await this.pool.query<{
          collector_id: string;
          source_ip: string;
          source_type: 'netflow_v9' | 'syslog';
          first_seen_at: string;
          last_seen_at: string;
          packet_count: string;
          blocked_packet_count: string;
          authorized: boolean;
        }>(`
          SELECT
            observation.collector_id,
            host(observation.source_ip) AS source_ip,
            observation.source_type,
            observation.first_seen_at,
            observation.last_seen_at,
            observation.packet_count::text,
            observation.blocked_packet_count::text,
            EXISTS (
              SELECT 1 FROM collector_firewall_authorizations allowed_source
              WHERE allowed_source.collector_id = observation.collector_id
                AND observation.source_ip <<= allowed_source.source_cidr
            ) AS authorized
          FROM collector_firewall_observations observation
          WHERE observation.collector_id = ANY($1::uuid[])
          ORDER BY observation.last_seen_at DESC
        `, [collectorIds])
      : { rows: [] };
    return collectorResult.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      name: row.name,
      collectorMode: row.collector_mode,
      configuredStatus: row.configured_status,
      netflowPort: row.netflow_port === null ? null : Number(row.netflow_port),
      syslogPort: row.syslog_port === null ? null : Number(row.syslog_port),
      secondaryNetflowPort: row.secondary_netflow_port === null ? null : Number(row.secondary_netflow_port),
      secondarySyslogPort: row.secondary_syslog_port === null ? null : Number(row.secondary_syslog_port),
      policyMode: row.collector_mode === 'cloud' ? row.policy_mode ?? 'monitor' : null,
      policyUpdatedAt: row.policy_updated_at ? new Date(row.policy_updated_at).toISOString() : null,
      appliedMode: row.applied_mode,
      appliedPolicyUpdatedAt: row.applied_policy_updated_at
        ? new Date(row.applied_policy_updated_at).toISOString() : null,
      appliedAt: row.applied_at ? new Date(row.applied_at).toISOString() : null,
      authorizations: authorizations.rows
        .filter((authorization) => authorization.collector_id === row.id)
        .map((authorization) => ({
          id: authorization.id,
          sourceCidr: authorization.source_cidr,
          description: authorization.description,
          createdAt: new Date(authorization.created_at).toISOString()
        })),
      observations: observations.rows
        .filter((observation) => observation.collector_id === row.id)
        .map((observation) => ({
          sourceIp: observation.source_ip,
          sourceType: observation.source_type,
          firstSeenAt: new Date(observation.first_seen_at).toISOString(),
          lastSeenAt: new Date(observation.last_seen_at).toISOString(),
          packetCount: Number(observation.packet_count),
          blockedPacketCount: Number(observation.blocked_packet_count),
          authorized: observation.authorized
        }))
    }));
  }

  async listInfrastructureFirewallPolicies(): Promise<InfrastructureFirewallPolicy[]> {
    const policies = await this.pool.query<{
      service: InfrastructureFirewallService;
      mode: InfrastructureFirewallMode;
      port: number;
      server_name: string;
      updated_at: string;
      applied_mode: InfrastructureFirewallMode | null;
      applied_policy_updated_at: string | null;
      applied_at: string | null;
    }>(`
      SELECT service, mode, port, server_name,
        updated_at, applied_mode, applied_policy_updated_at, applied_at
      FROM infrastructure_firewall_policies
      ORDER BY CASE service WHEN 'web' THEN 1 ELSE 2 END
    `);
    const authorizations = await this.pool.query<{
      id: string; service: InfrastructureFirewallService; source_cidr: string; description: string; created_at: string;
    }>(`
      SELECT id, service, source_cidr::text AS source_cidr, description, created_at
      FROM infrastructure_firewall_authorizations
      ORDER BY service, source_cidr::text
    `);
    return policies.rows.map((policy) => ({
      service: policy.service,
      mode: policy.mode,
      port: Number(policy.port),
      serverName: policy.server_name,
      updatedAt: new Date(policy.updated_at).toISOString(),
      appliedMode: policy.applied_mode,
      appliedPolicyUpdatedAt: policy.applied_policy_updated_at
        ? new Date(policy.applied_policy_updated_at).toISOString() : null,
      appliedAt: policy.applied_at ? new Date(policy.applied_at).toISOString() : null,
      authorizations: authorizations.rows
        .filter((authorization) => authorization.service === policy.service)
        .map((authorization) => ({
          id: authorization.id,
          sourceCidr: authorization.source_cidr,
          description: authorization.description,
          createdAt: new Date(authorization.created_at).toISOString()
        }))
    }));
  }

  async synchronizeInfrastructureFirewallIdentity(input: { serverName: string }): Promise<void> {
    await this.pool.query(`
      UPDATE infrastructure_firewall_policies
      SET port = CASE service WHEN 'web' THEN 443 ELSE 22 END,
          public_port = CASE service WHEN 'web' THEN 443 ELSE 22 END,
          server_name = $1,
          updated_at = CASE
            WHEN port IS DISTINCT FROM CASE service WHEN 'web' THEN 443 ELSE 22 END
              OR server_name IS DISTINCT FROM $1
            THEN now() ELSE updated_at END
    `, [input.serverName]);
  }

  async updateInfrastructureFirewallPolicy(input: {
    service: InfrastructureFirewallService;
    mode: InfrastructureFirewallMode;
    actorUserId: string;
  }): Promise<UpdateInfrastructureFirewallPolicyResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (input.mode === 'allowlist') {
        const allowed = await client.query(
          'SELECT 1 FROM infrastructure_firewall_authorizations WHERE service = $1 LIMIT 1',
          [input.service]
        );
        if (!allowed.rowCount) {
          await client.query('ROLLBACK');
          return { status: 'authorization_required' };
        }
      }
      await client.query(`
        UPDATE infrastructure_firewall_policies
        SET mode = $2, updated_by_user_id = $3, updated_at = now()
        WHERE service = $1
      `, [input.service, input.mode, input.actorUserId]);
      await client.query(`
        INSERT INTO infrastructure_firewall_audit (actor_user_id, service, action, details)
        VALUES ($1, $2, $3, jsonb_build_object('mode', $4::text))
      `, [input.actorUserId, input.service,
        input.mode === 'allowlist' ? 'policy_allowlist_enabled' : 'policy_open_enabled', input.mode]);
      await client.query('COMMIT');
      const policy = (await this.listInfrastructureFirewallPolicies())
        .find((item) => item.service === input.service)!;
      return { status: 'updated', policy };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async createInfrastructureFirewallAuthorization(input: {
    service: InfrastructureFirewallService;
    sourceCidr: string;
    description: string;
    actorUserId: string;
  }): Promise<CreateInfrastructureFirewallAuthorizationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        id: string; source_cidr: string; description: string; created_at: string;
      }>(`
        INSERT INTO infrastructure_firewall_authorizations
          (service, source_cidr, description, created_by_user_id)
        VALUES ($1, $2::cidr, $3, $4)
        ON CONFLICT (service, source_cidr) DO NOTHING
        RETURNING id, source_cidr::text AS source_cidr, description, created_at
      `, [input.service, input.sourceCidr, input.description, input.actorUserId]);
      const row = result.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { status: 'duplicate' };
      }
      await client.query(`
        INSERT INTO infrastructure_firewall_audit (actor_user_id, service, action, details)
        VALUES ($1, $2, 'source_authorized',
          jsonb_build_object('sourceCidr', $3::text, 'description', $4::text))
      `, [input.actorUserId, input.service, row.source_cidr, row.description]);
      await client.query('COMMIT');
      return {
        status: 'created',
        authorization: {
          id: row.id,
          sourceCidr: row.source_cidr,
          description: row.description,
          createdAt: new Date(row.created_at).toISOString()
        }
      };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteInfrastructureFirewallAuthorization(input: {
    authorizationId: string;
    actorUserId: string;
  }): Promise<DeleteInfrastructureFirewallAuthorizationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query<{
        service: InfrastructureFirewallService; source_cidr: string; description: string;
      }>(`
        SELECT service, source_cidr::text AS source_cidr, description
        FROM infrastructure_firewall_authorizations WHERE id = $1 FOR UPDATE
      `, [input.authorizationId]);
      const row = selected.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { status: 'authorization_not_found' };
      }
      const protection = await client.query<{ mode: InfrastructureFirewallMode; authorization_count: string }>(`
        SELECT p.mode, count(a.id)::text AS authorization_count
        FROM infrastructure_firewall_policies p
        LEFT JOIN infrastructure_firewall_authorizations a ON a.service = p.service
        WHERE p.service = $1 GROUP BY p.mode
      `, [row.service]);
      if (protection.rows[0]?.mode === 'allowlist' && Number(protection.rows[0].authorization_count) <= 1) {
        await client.query('ROLLBACK');
        return { status: 'last_authorization_required' };
      }
      await client.query('DELETE FROM infrastructure_firewall_authorizations WHERE id = $1', [input.authorizationId]);
      await client.query(`
        INSERT INTO infrastructure_firewall_audit (actor_user_id, service, action, details)
        VALUES ($1, $2, 'source_authorization_removed',
          jsonb_build_object('sourceCidr', $3::text, 'description', $4::text))
      `, [input.actorUserId, row.service, row.source_cidr, row.description]);
      await client.query('COMMIT');
      return { status: 'deleted' };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateInfrastructureFirewallAuthorization(input: {
    authorizationId: string;
    service: InfrastructureFirewallService;
    sourceCidr: string;
    description: string;
    actorUserId: string;
  }): Promise<UpdateInfrastructureFirewallAuthorizationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{ service: InfrastructureFirewallService; source_cidr: string }>(`
        SELECT service, source_cidr::text AS source_cidr
        FROM infrastructure_firewall_authorizations WHERE id = $1 FOR UPDATE
      `, [input.authorizationId]);
      if (!current.rows[0]) {
        await client.query('ROLLBACK');
        return { status: 'authorization_not_found' };
      }
      if (current.rows[0].service !== input.service) {
        const protection = await client.query<{ mode: InfrastructureFirewallMode; authorization_count: string }>(`
          SELECT p.mode, count(a.id)::text AS authorization_count
          FROM infrastructure_firewall_policies p
          LEFT JOIN infrastructure_firewall_authorizations a ON a.service = p.service
          WHERE p.service = $1 GROUP BY p.mode
        `, [current.rows[0].service]);
        if (protection.rows[0]?.mode === 'allowlist' && Number(protection.rows[0].authorization_count) <= 1) {
          await client.query('ROLLBACK');
          return { status: 'last_authorization_required' };
        }
      }
      const duplicate = await client.query(`
        SELECT 1 FROM infrastructure_firewall_authorizations
        WHERE service = $1 AND source_cidr = $2::cidr AND id <> $3 LIMIT 1
      `, [input.service, input.sourceCidr, input.authorizationId]);
      if (duplicate.rowCount) {
        await client.query('ROLLBACK');
        return { status: 'duplicate' };
      }
      const result = await client.query<{
        id: string; source_cidr: string; description: string; created_at: string;
      }>(`
        UPDATE infrastructure_firewall_authorizations
        SET service = $2, source_cidr = $3::cidr, description = $4
        WHERE id = $1
        RETURNING id, source_cidr::text AS source_cidr, description, created_at
      `, [input.authorizationId, input.service, input.sourceCidr, input.description]);
      await client.query(`
        INSERT INTO infrastructure_firewall_audit (actor_user_id, service, action, details)
        VALUES ($1, $2, 'source_authorized', jsonb_build_object(
          'authorizationId', $3::text, 'sourceCidr', $4::text, 'description', $5::text,
          'previousService', $6::text, 'previousSourceCidr', $7::text, 'operation', 'updated'
        ))
      `, [input.actorUserId, input.service, input.authorizationId, input.sourceCidr,
        input.description, current.rows[0].service, current.rows[0].source_cidr]);
      await client.query('COMMIT');
      const row = result.rows[0]!;
      return {
        status: 'updated',
        authorization: {
          id: row.id,
          sourceCidr: row.source_cidr,
          description: row.description,
          createdAt: new Date(row.created_at).toISOString()
        }
      };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateFirewallPolicy(input: {
    collectorId: string;
    tenantId: string | null;
    actorUserId: string;
    mode: FirewallMode;
  }): Promise<UpdateFirewallPolicyResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const collectorResult = await client.query<{ tenant_id: string; mode: 'edge' | 'cloud' }>(`
        SELECT tenant_id, mode
        FROM collectors
        WHERE id = $1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR tenant_id = $2)
        FOR UPDATE
      `, [input.collectorId, input.tenantId]);
      const collector = collectorResult.rows[0];
      if (!collector) {
        await client.query('ROLLBACK');
        return { status: 'collector_not_found' };
      }
      if (collector.mode !== 'cloud') {
        await client.query('ROLLBACK');
        return { status: 'edge_collector' };
      }
      if (input.mode === 'enforce') {
        const allowed = await client.query(`
          SELECT 1 FROM collector_firewall_authorizations
          WHERE collector_id = $1 AND tenant_id = $2
          LIMIT 1
        `, [input.collectorId, collector.tenant_id]);
        if (!allowed.rowCount) {
          await client.query('ROLLBACK');
          return { status: 'authorization_required' };
        }
      }
      const result = await client.query<{ updated_at: string }>(`
        INSERT INTO collector_firewall_policies
          (collector_id, tenant_id, mode, updated_by_user_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (collector_id) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          mode = excluded.mode,
          updated_by_user_id = excluded.updated_by_user_id,
          updated_at = now()
        RETURNING updated_at
      `, [input.collectorId, collector.tenant_id, input.mode, input.actorUserId]);
      const updatedAt = new Date(result.rows[0]!.updated_at).toISOString();
      await client.query(`
        INSERT INTO collector_firewall_audit
          (tenant_id, collector_id, actor_user_id, action, details)
        VALUES ($1, $2, $3, $4, jsonb_build_object('mode', $5::text, 'policyUpdatedAt', $6::text))
      `, [
        collector.tenant_id,
        input.collectorId,
        input.actorUserId,
        input.mode === 'enforce' ? 'policy_enforcement_enabled' : 'policy_monitor_enabled',
        input.mode,
        updatedAt
      ]);
      await client.query('COMMIT');
      return { status: 'updated', tenantId: collector.tenant_id, mode: input.mode, updatedAt };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async createFirewallAuthorization(input: {
    collectorId: string;
    tenantId: string | null;
    actorUserId: string;
    sourceCidr: string;
    description: string;
  }): Promise<CreateFirewallAuthorizationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const collectorResult = await client.query<{ tenant_id: string; mode: 'edge' | 'cloud' }>(`
        SELECT tenant_id, mode
        FROM collectors
        WHERE id = $1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR tenant_id = $2)
        FOR UPDATE
      `, [input.collectorId, input.tenantId]);
      const collector = collectorResult.rows[0];
      if (!collector) {
        await client.query('ROLLBACK');
        return { status: 'collector_not_found' };
      }
      if (collector.mode !== 'cloud') {
        await client.query('ROLLBACK');
        return { status: 'edge_collector' };
      }
      const result = await client.query<{
        id: string; source_cidr: string; description: string; created_at: string;
      }>(`
        INSERT INTO collector_firewall_authorizations
          (collector_id, tenant_id, source_cidr, description, created_by_user_id)
        VALUES ($1, $2, $3::cidr, $4, $5)
        ON CONFLICT (collector_id, source_cidr) DO NOTHING
        RETURNING id, source_cidr::text AS source_cidr, description, created_at
      `, [input.collectorId, collector.tenant_id, input.sourceCidr, input.description, input.actorUserId]);
      const row = result.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { status: 'duplicate' };
      }
      await client.query(`
        INSERT INTO collector_firewall_audit
          (tenant_id, collector_id, actor_user_id, action, details)
        VALUES ($1, $2, $3, 'source_authorized',
          jsonb_build_object('sourceCidr', $4::text, 'description', $5::text))
      `, [collector.tenant_id, input.collectorId, input.actorUserId, row.source_cidr, row.description]);
      await client.query('COMMIT');
      return {
        status: 'created',
        tenantId: collector.tenant_id,
        authorization: {
          id: row.id,
          sourceCidr: row.source_cidr,
          description: row.description,
          createdAt: new Date(row.created_at).toISOString()
        }
      };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteFirewallAuthorization(input: {
    authorizationId: string;
    tenantId: string | null;
    actorUserId: string;
  }): Promise<DeleteFirewallAuthorizationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query<{
        tenant_id: string; collector_id: string; source_cidr: string; description: string;
      }>(`
        SELECT tenant_id, collector_id, source_cidr::text AS source_cidr, description
        FROM collector_firewall_authorizations
        WHERE id = $1 AND ($2::uuid IS NULL OR tenant_id = $2)
        FOR UPDATE
      `, [input.authorizationId, input.tenantId]);
      const row = selected.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { status: 'authorization_not_found' };
      }
      const protection = await client.query<{ mode: FirewallMode; authorization_count: string }>(`
        SELECT p.mode, count(a.id)::text AS authorization_count
        FROM collector_firewall_policies p
        LEFT JOIN collector_firewall_authorizations a ON a.collector_id = p.collector_id
        WHERE p.collector_id = $1 AND p.tenant_id = $2
        GROUP BY p.mode
      `, [row.collector_id, row.tenant_id]);
      if (protection.rows[0]?.mode === 'enforce' && Number(protection.rows[0].authorization_count) <= 1) {
        await client.query('ROLLBACK');
        return { status: 'last_authorization_required' };
      }
      await client.query('DELETE FROM collector_firewall_authorizations WHERE id = $1', [input.authorizationId]);
      await client.query(`
        INSERT INTO collector_firewall_audit
          (tenant_id, collector_id, actor_user_id, action, details)
        VALUES ($1, $2, $3, 'source_authorization_removed',
          jsonb_build_object('sourceCidr', $4::text, 'description', $5::text))
      `, [row.tenant_id, row.collector_id, input.actorUserId, row.source_cidr, row.description]);
      await client.query('COMMIT');
      return { status: 'deleted', tenantId: row.tenant_id };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async createManagedDevice(input: {
    tenantId: string;
    actorUserId: string;
    collectorId: string;
    name: string;
    vendor: string;
    model: string | null;
    exporterIp: string;
    timezone: string;
  }): Promise<CreateManagedDeviceResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM tenants WHERE id = $1 FOR UPDATE', [input.tenantId]);
      const usageResult = await client.query<{
        plan_code: string | null;
        plan_name: string | null;
        device_limit: number | null;
        devices_used: string;
      }>(`
        SELECT
          sp.code AS plan_code,
          sp.name AS plan_name,
          COALESCE(tpa.device_limit_override, sp.max_devices) AS device_limit,
          count(d.id)::text AS devices_used
        FROM tenants t
        LEFT JOIN tenant_plan_assignments tpa ON tpa.tenant_id = t.id
        LEFT JOIN service_plans sp ON sp.id = tpa.plan_id
        LEFT JOIN devices d ON d.tenant_id = t.id AND d.deleted_at IS NULL
        WHERE t.id = $1
        GROUP BY sp.code, sp.name, tpa.device_limit_override, sp.max_devices
      `, [input.tenantId]);
      const usage = this.mapTenantPlanUsage(usageResult.rows[0]);
      if (usage.deviceLimit !== null && usage.devicesUsed >= usage.deviceLimit) {
        await client.query('ROLLBACK');
        return { status: 'device_limit_reached', usage };
      }
      const result = await client.query<{
        id: string; collector_id: string; name: string; vendor: string; model: string | null;
        exporter_ip: string; timezone: string; enabled: boolean;
      }>(`
        INSERT INTO devices
          (tenant_id, collector_id, name, vendor, model, exporter_ip, timezone, enabled)
        SELECT $1, c.id, $3, $4, $5, $6::inet, $7, true
        FROM collectors c
        WHERE c.id = $2 AND c.tenant_id = $1 AND c.status <> 'disabled' AND c.deleted_at IS NULL
        RETURNING id, collector_id, name, vendor, model, host(exporter_ip) AS exporter_ip, timezone, enabled
      `, [input.tenantId, input.collectorId, input.name, input.vendor, input.model, input.exporterIp, input.timezone]);
      const row = result.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { status: 'collector_not_found' };
      }
      await client.query(`
        INSERT INTO device_management_audit
          (tenant_id, actor_user_id, device_id, action, details)
        VALUES ($1, $2, $3, 'created', jsonb_build_object('name', $4::text, 'vendor', $5::text, 'exporterIp', $6::text))
      `, [input.tenantId, input.actorUserId, row.id, row.name, row.vendor, row.exporter_ip]);
      await client.query('COMMIT');
      return {
        status: 'created',
        device: {
          id: row.id,
          collectorId: row.collector_id,
          name: row.name,
          vendor: row.vendor,
          model: row.model,
          exporterIp: row.exporter_ip,
          timezone: row.timezone,
          enabled: row.enabled
        }
      };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateManagedDevice(input: {
    tenantId: string;
    actorUserId: string;
    deviceId: string;
    collectorId: string;
    name: string;
    vendor: string;
    model: string | null;
    exporterIp: string;
    timezone: string;
    enabled: boolean;
  }): Promise<DeviceDefinition | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const previousResult = await client.query<{ enabled: boolean }>(`
        SELECT enabled FROM devices WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL FOR UPDATE
      `, [input.deviceId, input.tenantId]);
      const previous = previousResult.rows[0];
      if (!previous) {
        await client.query('ROLLBACK');
        return undefined;
      }
      const result = await client.query<{
        id: string; collector_id: string; name: string; vendor: string; model: string | null;
        exporter_ip: string; timezone: string; enabled: boolean;
      }>(`
        UPDATE devices d SET
          collector_id = c.id, name = $4, vendor = $5, model = $6,
          exporter_ip = $7::inet, timezone = $8, enabled = $9
        FROM collectors c
        WHERE d.id = $1 AND d.tenant_id = $2 AND d.deleted_at IS NULL
          AND c.id = $3 AND c.tenant_id = d.tenant_id
          AND c.status <> 'disabled' AND c.deleted_at IS NULL
        RETURNING d.id, d.collector_id, d.name, d.vendor, d.model,
          host(d.exporter_ip) AS exporter_ip, d.timezone, d.enabled
      `, [
        input.deviceId, input.tenantId, input.collectorId, input.name, input.vendor,
        input.model, input.exporterIp, input.timezone, input.enabled
      ]);
      const row = result.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return undefined;
      }
      const action = previous.enabled !== row.enabled ? (row.enabled ? 'enabled' : 'disabled') : 'updated';
      await client.query(`
        INSERT INTO device_management_audit
          (tenant_id, actor_user_id, device_id, action, details)
        VALUES ($1, $2, $3, $4, jsonb_build_object('name', $5::text, 'vendor', $6::text, 'exporterIp', $7::text, 'enabled', $8::boolean))
      `, [input.tenantId, input.actorUserId, row.id, action, row.name, row.vendor, row.exporter_ip, row.enabled]);
      await client.query('COMMIT');
      return {
        id: row.id,
        collectorId: row.collector_id,
        name: row.name,
        vendor: row.vendor,
        model: row.model,
        exporterIp: row.exporter_ip,
        timezone: row.timezone,
        enabled: row.enabled
      };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async softDeleteManagedDevice(input: {
    tenantId: string;
    actorUserId: string;
    deviceId: string;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM tenants WHERE id = $1 FOR UPDATE', [input.tenantId]);
      const result = await client.query<{ id: string; name: string; exporter_ip: string; vendor: string }>(`
        UPDATE devices
        SET enabled = false, deleted_at = now()
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        RETURNING id, name, host(exporter_ip) AS exporter_ip, vendor
      `, [input.deviceId, input.tenantId]);
      const row = result.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(`
        INSERT INTO device_management_audit
          (tenant_id, actor_user_id, device_id, action, details)
        VALUES ($1, $2, $3, 'deleted', jsonb_build_object('name', $4::text, 'vendor', $5::text, 'exporterIp', $6::text))
      `, [input.tenantId, input.actorUserId, row.id, row.name, row.vendor, row.exporter_ip]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private mapTenantPlanUsage(row: {
    plan_code: string | null;
    plan_name: string | null;
    device_limit: number | null;
    devices_used: string;
  } | undefined): TenantPlanUsage {
    const devicesUsed = Number(row?.devices_used ?? 0);
    const deviceLimit = row?.device_limit === null || row?.device_limit === undefined
      ? null
      : Number(row.device_limit);
    return {
      code: row?.plan_code ?? 'unassigned',
      name: row?.plan_name ?? 'Sem plano definido',
      deviceLimit,
      devicesUsed,
      devicesRemaining: deviceLimit === null ? null : Math.max(0, deviceLimit - devicesUsed)
    };
  }

  private mapDeviceDiscoverySession(row: {
    id: string; collector_id: string; collector_name: string; started_at: string; ends_at: string;
  }): DeviceDiscoverySession {
    return {
      id: row.id,
      collectorId: row.collector_id,
      collectorName: row.collector_name,
      startedAt: new Date(row.started_at).toISOString(),
      endsAt: new Date(row.ends_at).toISOString()
    };
  }

  async recordCollectorHeartbeat(heartbeat: CollectorHeartbeat): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const collector = await client.query(`
        UPDATE collectors
        SET last_seen_at = now(), version = $3, status = 'online'
        WHERE id = $1 AND tenant_id = $2 AND status <> 'disabled' AND deleted_at IS NULL
        RETURNING id
      `, [heartbeat.collectorId, heartbeat.tenantId, heartbeat.version]);
      if (collector.rowCount !== 1) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(`
        INSERT INTO collector_telemetry
          (collector_id, tenant_id, version, sent_at, received_at, pending_records,
           pending_events, pending_batches, acknowledged_records_retained,
           oldest_pending_at, spool_bytes, last_sync_at, last_sync_error,
           netflow_port, syslog_port,
           host_name, host_platform, host_uptime_seconds, cpu_usage_percent,
           memory_total_bytes, memory_used_bytes, disk_total_bytes, disk_used_bytes)
        VALUES ($1, $2, $3, $4, now(), $5, $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        ON CONFLICT (collector_id) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          version = excluded.version,
          sent_at = excluded.sent_at,
          received_at = now(),
          pending_records = excluded.pending_records,
          pending_events = excluded.pending_events,
          pending_batches = excluded.pending_batches,
          acknowledged_records_retained = excluded.acknowledged_records_retained,
          oldest_pending_at = excluded.oldest_pending_at,
          spool_bytes = excluded.spool_bytes,
          last_sync_at = excluded.last_sync_at,
          last_sync_error = excluded.last_sync_error,
          netflow_port = excluded.netflow_port,
          syslog_port = excluded.syslog_port,
          host_name = excluded.host_name,
          host_platform = excluded.host_platform,
          host_uptime_seconds = excluded.host_uptime_seconds,
          cpu_usage_percent = excluded.cpu_usage_percent,
          memory_total_bytes = excluded.memory_total_bytes,
          memory_used_bytes = excluded.memory_used_bytes,
          disk_total_bytes = excluded.disk_total_bytes,
          disk_used_bytes = excluded.disk_used_bytes
      `, [
        heartbeat.collectorId,
        heartbeat.tenantId,
        heartbeat.version,
        heartbeat.sentAt,
        heartbeat.pendingRecords,
        heartbeat.pendingEvents,
        heartbeat.pendingBatches,
        heartbeat.acknowledgedRecordsRetained,
        heartbeat.oldestPendingAt,
        heartbeat.spoolBytes,
        heartbeat.lastSyncAt,
        heartbeat.lastSyncError,
        heartbeat.netflowPort ?? null,
        heartbeat.syslogPort ?? null,
        heartbeat.hostMetrics?.hostname ?? null,
        heartbeat.hostMetrics?.platform ?? null,
        heartbeat.hostMetrics?.uptimeSeconds ?? null,
        heartbeat.hostMetrics?.cpuUsagePercent ?? null,
        heartbeat.hostMetrics?.memoryTotalBytes ?? null,
        heartbeat.hostMetrics?.memoryUsedBytes ?? null,
        heartbeat.hostMetrics?.diskTotalBytes ?? null,
        heartbeat.hostMetrics?.diskUsedBytes ?? null
      ]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async listCollectors(tenantId: string | null): Promise<CollectorStatusRecord[]> {
    const result = await this.pool.query<{
      id: string;
      tenant_id: string;
      tenant_name: string;
      name: string;
      mode: CollectorStatusRecord['mode'];
      netflow_port: number | null;
      syslog_port: number | null;
      secondary_netflow_port: number | null;
      secondary_syslog_port: number | null;
      configured_status: string;
      version: string | null;
      device_count: string;
      last_seen_at: string | null;
      telemetry_sent_at: string | null;
      pending_records: string | null;
      pending_events: string | null;
      pending_batches: string | null;
      acknowledged_records_retained: string | null;
      oldest_pending_at: string | null;
      spool_bytes: string | null;
      last_sync_at: string | null;
      last_sync_error: string | null;
      batches_24h: string;
      raw_records_24h: string;
      events_24h: string;
      host_name: string | null;
      host_platform: string | null;
      host_uptime_seconds: string | null;
      cpu_usage_percent: number | null;
      memory_total_bytes: string | null;
      memory_used_bytes: string | null;
      disk_total_bytes: string | null;
      disk_used_bytes: string | null;
    }>(`
      SELECT
        c.id, c.tenant_id, tenant.name AS tenant_name, c.name, c.mode,
        COALESCE(c.netflow_port, t.netflow_port) AS netflow_port,
        COALESCE(c.syslog_port, t.syslog_port) AS syslog_port,
        c.secondary_netflow_port,
        c.secondary_syslog_port,
        c.status AS configured_status,
        COALESCE(t.version, c.version) AS version,
        (SELECT count(*) FROM devices d WHERE d.collector_id = c.id AND d.enabled = true AND d.deleted_at IS NULL) AS device_count,
        t.received_at AS last_seen_at,
        t.sent_at AS telemetry_sent_at,
        t.pending_records, t.pending_events, t.pending_batches,
        t.acknowledged_records_retained, t.oldest_pending_at,
        t.spool_bytes, t.last_sync_at, t.last_sync_error,
        t.host_name, t.host_platform, t.host_uptime_seconds, t.cpu_usage_percent,
        t.memory_total_bytes, t.memory_used_bytes, t.disk_total_bytes, t.disk_used_bytes,
        COALESCE(b.batches_24h, 0) AS batches_24h,
        COALESCE(b.raw_records_24h, 0) AS raw_records_24h,
        COALESCE(b.events_24h, 0) AS events_24h
      FROM collectors c
      JOIN tenants tenant
        ON tenant.id = c.tenant_id
       AND tenant.active = true
       AND tenant.tenant_kind = 'customer'
      LEFT JOIN collector_telemetry t ON t.collector_id = c.id AND t.tenant_id = c.tenant_id
      LEFT JOIN LATERAL (
        SELECT
          count(*) AS batches_24h,
          COALESCE(sum(raw_count), 0) AS raw_records_24h,
          COALESCE(sum(event_count), 0) AS events_24h
        FROM sync_batches b
        WHERE b.collector_id = c.id
          AND b.received_at >= now() - INTERVAL '24 hours'
          AND b.status = 'committed'
      ) b ON true
      WHERE ($1::uuid IS NULL OR c.tenant_id = $1::uuid)
        AND c.deleted_at IS NULL
      ORDER BY tenant.name, c.name
    `, [tenantId]);
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      name: row.name,
      mode: row.mode,
      netflowPort: row.netflow_port === null ? null : Number(row.netflow_port),
      syslogPort: row.syslog_port === null ? null : Number(row.syslog_port),
      secondaryNetflowPort: row.secondary_netflow_port === null ? null : Number(row.secondary_netflow_port),
      secondarySyslogPort: row.secondary_syslog_port === null ? null : Number(row.secondary_syslog_port),
      configuredStatus: row.configured_status,
      version: row.version,
      deviceCount: Number(row.device_count),
      lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
      telemetrySentAt: row.telemetry_sent_at ? new Date(row.telemetry_sent_at).toISOString() : null,
      pendingRecords: Number(row.pending_records ?? 0),
      pendingEvents: Number(row.pending_events ?? 0),
      pendingBatches: Number(row.pending_batches ?? 0),
      acknowledgedRecordsRetained: Number(row.acknowledged_records_retained ?? 0),
      oldestPendingAt: row.oldest_pending_at ? new Date(row.oldest_pending_at).toISOString() : null,
      spoolBytes: Number(row.spool_bytes ?? 0),
      lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
      lastSyncError: row.last_sync_error ?? '',
      batches24h: Number(row.batches_24h),
      rawRecords24h: Number(row.raw_records_24h),
      events24h: Number(row.events_24h),
      hostMetrics: row.host_name && row.host_platform && row.host_uptime_seconds !== null
        && row.memory_total_bytes !== null && row.memory_used_bytes !== null
        ? {
            hostname: row.host_name,
            platform: row.host_platform,
            uptimeSeconds: Number(row.host_uptime_seconds),
            cpuUsagePercent: row.cpu_usage_percent === null ? null : Number(row.cpu_usage_percent),
            memoryTotalBytes: Number(row.memory_total_bytes),
            memoryUsedBytes: Number(row.memory_used_bytes),
            diskTotalBytes: row.disk_total_bytes === null ? null : Number(row.disk_total_bytes),
            diskUsedBytes: row.disk_used_bytes === null ? null : Number(row.disk_used_bytes)
          }
        : null
    }));
  }

  async createManagedCollector(input: {
    tenantId: string;
    actorUserId: string;
    name: string;
    mode: ManagedCollector['mode'];
    tokenHash: string;
    cloudPortStart: number;
    cloudPortEnd: number;
    secondaryCloudPortStart: number;
    secondaryCloudPortEnd: number;
  }): Promise<CreateManagedCollectorResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        input.mode === 'cloud' ? 'managed-cloud-port-pool' : `managed-edge:${input.tenantId}`
      ]);
      if (input.mode === 'cloud') {
        const existing = await client.query(`
          SELECT 1 FROM collectors
          WHERE tenant_id = $1 AND mode = 'cloud' AND deleted_at IS NULL
          LIMIT 1
        `, [input.tenantId]);
        if (existing.rowCount) {
          await client.query('ROLLBACK');
          return { status: 'cloud_collector_already_exists' };
        }
      }
      const portPairResult = input.mode === 'cloud'
        ? await client.query<{
            netflow_port: number | null; syslog_port: number | null;
            secondary_netflow_port: number | null; secondary_syslog_port: number | null;
          }>(`
            WITH primary_pair AS (
              SELECT candidate
              FROM generate_series($1::integer, $2::integer - 1, 2) candidate
              WHERE NOT EXISTS (
                SELECT 1 FROM collectors
                WHERE mode = 'cloud' AND deleted_at IS NULL
                  AND int4range(netflow_port, syslog_port, '[]')
                    && int4range(candidate, candidate + 1, '[]')
              )
              ORDER BY candidate
              LIMIT 1
            ), secondary_pair AS (
              SELECT candidate
              FROM generate_series($3::integer, $4::integer - 1, 2) candidate
              WHERE NOT EXISTS (
                SELECT 1 FROM collectors
                WHERE mode = 'cloud' AND deleted_at IS NULL
                  AND int4range(secondary_netflow_port, secondary_syslog_port, '[]')
                    && int4range(candidate, candidate + 1, '[]')
              )
              ORDER BY candidate
              LIMIT 1
            )
            SELECT
              (SELECT candidate FROM primary_pair) AS netflow_port,
              (SELECT candidate + 1 FROM primary_pair) AS syslog_port,
              (SELECT candidate FROM secondary_pair) AS secondary_netflow_port,
              (SELECT candidate + 1 FROM secondary_pair) AS secondary_syslog_port
          `, [input.cloudPortStart, input.cloudPortEnd,
            input.secondaryCloudPortStart, input.secondaryCloudPortEnd])
        : null;
      const netflowPort = portPairResult?.rows[0]?.netflow_port ?? null;
      const syslogPort = portPairResult?.rows[0]?.syslog_port ?? null;
      const secondaryNetflowPort = portPairResult?.rows[0]?.secondary_netflow_port ?? null;
      const secondarySyslogPort = portPairResult?.rows[0]?.secondary_syslog_port ?? null;
      if (input.mode === 'cloud' && (netflowPort === null || syslogPort === null
        || secondaryNetflowPort === null || secondarySyslogPort === null)) {
        await client.query('ROLLBACK');
        return { status: 'cloud_port_capacity_exhausted' };
      }
      const result = await client.query<{
        id: string; name: string; mode: ManagedCollector['mode']; status: string;
        netflow_port: number | null; syslog_port: number | null;
        secondary_netflow_port: number | null; secondary_syslog_port: number | null;
        created_at: string; updated_at: string;
      }>(`
        INSERT INTO collectors
          (tenant_id, name, mode, api_key_hash, status, netflow_port, syslog_port,
           secondary_netflow_port, secondary_syslog_port)
        VALUES ($1, $2, $3, $4, 'provisioned', $5, $6, $7, $8)
        RETURNING id, name, mode, status, netflow_port, syslog_port,
          secondary_netflow_port, secondary_syslog_port, created_at, updated_at
      `, [input.tenantId, input.name, input.mode, input.tokenHash, netflowPort, syslogPort,
        secondaryNetflowPort, secondarySyslogPort]);
      const row = result.rows[0];
      if (!row) throw new Error('Coletor não foi criado');
      if (row.mode === 'cloud') {
        await client.query(`
          INSERT INTO collector_firewall_policies
            (collector_id, tenant_id, mode, updated_by_user_id)
          VALUES ($1, $2, 'monitor', $3)
          ON CONFLICT (collector_id) DO NOTHING
        `, [row.id, input.tenantId, input.actorUserId]);
      }
      await client.query(`
        INSERT INTO collector_management_audit
          (tenant_id, actor_user_id, collector_id, action, details)
        VALUES ($1, $2, $3, 'created', jsonb_build_object('name', $4::text, 'mode', $5::text))
      `, [input.tenantId, input.actorUserId, row.id, row.name, row.mode]);
      await client.query('COMMIT');
      return { status: 'created', collector: {
        id: row.id, name: row.name, mode: row.mode,
        netflowPort: row.netflow_port === null ? null : Number(row.netflow_port),
        syslogPort: row.syslog_port === null ? null : Number(row.syslog_port),
        secondaryNetflowPort: row.secondary_netflow_port === null ? null : Number(row.secondary_netflow_port),
        secondarySyslogPort: row.secondary_syslog_port === null ? null : Number(row.secondary_syslog_port),
        configuredStatus: row.status,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString()
      } };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateManagedCollector(input: {
    tenantId: string;
    actorUserId: string;
    collectorId: string;
    name: string;
    mode: ManagedCollector['mode'];
    active: boolean;
  }): Promise<UpdateManagedCollectorResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const previousResult = await client.query<{ status: string; mode: ManagedCollector['mode'] }>(`
        SELECT status, mode FROM collectors
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        FOR UPDATE
      `, [input.collectorId, input.tenantId]);
      const previous = previousResult.rows[0];
      if (!previous) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }
      if (previous.mode !== input.mode) {
        await client.query('ROLLBACK');
        return { status: 'mode_immutable' };
      }
      const nextStatus = input.active
        ? (previous.status === 'disabled' ? 'provisioned' : previous.status)
        : 'disabled';
      const result = await client.query<{
        id: string; name: string; mode: ManagedCollector['mode']; status: string;
        netflow_port: number | null; syslog_port: number | null;
        secondary_netflow_port: number | null; secondary_syslog_port: number | null;
        created_at: string; updated_at: string;
      }>(`
        UPDATE collectors
        SET name = $3, status = $4, updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        RETURNING id, name, mode, status, netflow_port, syslog_port,
          secondary_netflow_port, secondary_syslog_port, created_at, updated_at
      `, [input.collectorId, input.tenantId, input.name, nextStatus]);
      const row = result.rows[0];
      if (!row) throw new Error('Coletor não foi atualizado');
      const action = previous.status === 'disabled' && nextStatus !== 'disabled'
        ? 'activated'
        : previous.status !== 'disabled' && nextStatus === 'disabled'
          ? 'deactivated'
          : 'updated';
      await client.query(`
        INSERT INTO collector_management_audit
          (tenant_id, actor_user_id, collector_id, action, details)
        VALUES ($1, $2, $3, $4, jsonb_build_object('name', $5::text, 'mode', $6::text, 'active', $7::boolean))
      `, [input.tenantId, input.actorUserId, row.id, action, row.name, row.mode, input.active]);
      await client.query('COMMIT');
      return { status: 'updated', collector: {
        id: row.id, name: row.name, mode: row.mode,
        netflowPort: row.netflow_port === null ? null : Number(row.netflow_port),
        syslogPort: row.syslog_port === null ? null : Number(row.syslog_port),
        secondaryNetflowPort: row.secondary_netflow_port === null ? null : Number(row.secondary_netflow_port),
        secondarySyslogPort: row.secondary_syslog_port === null ? null : Number(row.secondary_syslog_port),
        configuredStatus: row.status,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString()
      } };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async rotateCollectorCredential(input: {
    tenantId: string;
    actorUserId: string;
    collectorId: string;
    tokenHash: string;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string; name: string }>(`
        UPDATE collectors
        SET api_key_hash = $3, updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        RETURNING id, name
      `, [input.collectorId, input.tenantId, input.tokenHash]);
      const row = result.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(`
        INSERT INTO collector_management_audit
          (tenant_id, actor_user_id, collector_id, action, details)
        VALUES ($1, $2, $3, 'credential_rotated', jsonb_build_object('name', $4::text))
      `, [input.tenantId, input.actorUserId, row.id, row.name]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async softDeleteManagedCollector(input: {
    tenantId: string;
    actorUserId: string;
    collectorId: string;
  }): Promise<'deleted' | 'not_found' | 'has_devices'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const collectorResult = await client.query<{
        id: string;
        name: string;
        mode: ManagedCollector['mode'];
      }>(`
        SELECT id, name, mode
        FROM collectors
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
        FOR UPDATE
      `, [input.collectorId, input.tenantId]);
      const collector = collectorResult.rows[0];
      if (!collector) {
        await client.query('ROLLBACK');
        return 'not_found';
      }
      const linkedDevices = await client.query<{ count: string }>(`
        SELECT count(*) AS count
        FROM devices
        WHERE collector_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
      `, [input.collectorId, input.tenantId]);
      if (Number(linkedDevices.rows[0]?.count ?? 0) > 0) {
        await client.query('ROLLBACK');
        return 'has_devices';
      }
      await client.query(`
        UPDATE collectors
        SET status = 'disabled', deleted_at = now(), updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
      `, [input.collectorId, input.tenantId]);
      await client.query(`
        INSERT INTO collector_management_audit
          (tenant_id, actor_user_id, collector_id, action, details)
        VALUES ($1, $2, $3, 'deleted', jsonb_build_object('name', $4::text, 'mode', $5::text))
      `, [input.tenantId, input.actorUserId, collector.id, collector.name, collector.mode]);
      await client.query('COMMIT');
      return 'deleted';
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async registerBatch(batch: IngestBatch): Promise<BatchRegistration> {
    const registrations = await this.registerBatches([batch]);
    const registration = registrations.get(batch.batchId);
    if (!registration) throw new Error(`Lote ${batch.batchId} não foi registrado`);
    return registration;
  }

  async registerBatches(batches: IngestBatch[]): Promise<Map<string, BatchRegistration>> {
    if (!batches.length) return new Map();
    const first = batches[0]!;
    if (batches.some((batch) => batch.tenantId !== first.tenantId || batch.collectorId !== first.collectorId)) {
      throw new Error('Um grupo de lotes deve pertencer ao mesmo coletor');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const collector = await client.query(`
        UPDATE collectors SET last_seen_at = now()
        WHERE id = $1 AND tenant_id = $2 AND status <> 'disabled' AND deleted_at IS NULL
        RETURNING id
      `, [first.collectorId, first.tenantId]);
      if (collector.rowCount !== 1) throw new Error(`Coletor ${first.collectorId} não pertence ao tenant informado`);
      const batchIds = batches.map((batch) => batch.batchId);
      const existing = await client.query<{
        batch_id: string;
        checksum: string;
        raw_count: number;
        event_count: number;
        status: 'received' | 'committed' | 'rejected';
      }>(`
        SELECT batch_id, checksum, raw_count, event_count, status
        FROM sync_batches
        WHERE batch_id = ANY($1::uuid[])
        FOR UPDATE
      `, [batchIds]);

      const existingById = new Map(existing.rows.map((row) => [row.batch_id, row]));
      const registrations = new Map<string, BatchRegistration>();
      const missing: Array<{
        batchId: string; tenantId: string; collectorId: string; checksum: string; rawCount: number; eventCount: number;
      }> = [];
      for (const batch of batches) {
        const row = existingById.get(batch.batchId);
        if (row) {
          if (row.checksum !== batch.checksum || row.raw_count !== batch.rawRecords.length || row.event_count !== batch.events.length) {
            throw new Error(`Lote ${batch.batchId} reenviado com conteúdo divergente`);
          }
          if (row.status === 'rejected') throw new Error(`Lote ${batch.batchId} já foi rejeitado`);
          registrations.set(batch.batchId, { status: row.status });
        } else {
          missing.push({
            batchId: batch.batchId,
            tenantId: batch.tenantId,
            collectorId: batch.collectorId,
            checksum: batch.checksum,
            rawCount: batch.rawRecords.length,
            eventCount: batch.events.length
          });
          registrations.set(batch.batchId, { status: 'new' });
        }
      }
      if (missing.length) {
        await client.query(`
          INSERT INTO sync_batches
            (batch_id, tenant_id, collector_id, checksum, raw_count, event_count, status)
          SELECT input.batch_id, input.tenant_id, input.collector_id,
            input.checksum, input.raw_count, input.event_count, 'received'
          FROM jsonb_to_recordset($1::jsonb) AS input(
            batch_id uuid, tenant_id uuid, collector_id uuid,
            checksum text, raw_count integer, event_count integer
          )
        `, [JSON.stringify(missing.map((batch) => ({
          batch_id: batch.batchId,
          tenant_id: batch.tenantId,
          collector_id: batch.collectorId,
          checksum: batch.checksum,
          raw_count: batch.rawCount,
          event_count: batch.eventCount
        })))]);
      }
      await client.query('COMMIT');
      return registrations;
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async markBatchCommitted(batchId: string): Promise<void> {
    await this.markBatchesCommitted([batchId]);
  }

  async markBatchesCommitted(batchIds: string[]): Promise<void> {
    if (!batchIds.length) return;
    const result = await this.pool.query(`
      UPDATE sync_batches
      SET status = 'committed', committed_at = now(), error_message = NULL
      WHERE batch_id = ANY($1::uuid[]) AND status IN ('received', 'committed')
      RETURNING batch_id
    `, [batchIds]);
    if (result.rowCount !== new Set(batchIds).size) throw new Error('Nem todos os lotes foram encontrados para confirmação');
  }

  async markBatchRejected(batchId: string, error: string): Promise<void> {
    await this.pool.query(`
      UPDATE sync_batches
      SET status = 'rejected', error_message = $2
      WHERE batch_id = $1 AND status <> 'committed'
    `, [batchId, error.slice(0, 4000)]);
  }

  async auditQuery(input: QueryAuditInput): Promise<string> {
    const result = await this.pool.query<{ id: string }>(`
      INSERT INTO query_audit
        (tenant_id, user_id, public_ip, searched_at, port, protocol, erp_requested, result_count, request_id, duration_ms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      input.tenantId,
      input.userId,
      input.publicIp,
      input.searchedAt,
      input.port,
      input.protocol,
      input.erpRequested,
      input.resultCount,
      input.requestId,
      input.durationMs
    ]);
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Auditoria da consulta não foi criada');
    return id;
  }

  async getCompanyProfile(tenantId: string): Promise<CompanyProfile | null> {
    const result = await this.pool.query<{
      tenant_id: string; tenant_name: string; legal_name: string | null; trade_name: string | null;
      cnpj: string | null; phone: string | null; email: string | null; postal_code: string | null;
      street: string | null; address_number: string | null; complement: string | null;
      district: string | null; city: string | null; state: string | null; logo_configured: boolean;
      updated_at: string | null;
    }>(`
      SELECT t.id AS tenant_id, t.name AS tenant_name,
        p.legal_name, p.trade_name, p.cnpj, p.phone, p.email, p.postal_code, p.street,
        p.address_number, p.complement, p.district, p.city, p.state,
        (p.logo_data IS NOT NULL) AS logo_configured, p.updated_at
      FROM tenants t
      LEFT JOIN tenant_company_profiles p ON p.tenant_id = t.id
      WHERE t.id = $1
    `, [tenantId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      legalName: row.legal_name ?? '',
      tradeName: row.trade_name ?? '',
      cnpj: row.cnpj ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      postalCode: row.postal_code ?? '',
      street: row.street ?? '',
      addressNumber: row.address_number ?? '',
      complement: row.complement ?? '',
      district: row.district ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      logoConfigured: row.logo_configured,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    };
  }

  async getCompanyLogo(tenantId: string): Promise<{ data: Buffer; mime: 'image/png' | 'image/jpeg' } | null> {
    const result = await this.pool.query<{ logo_data: Buffer | null; logo_mime: 'image/png' | 'image/jpeg' | null }>(`
      SELECT logo_data, logo_mime FROM tenant_company_profiles WHERE tenant_id = $1
    `, [tenantId]);
    const row = result.rows[0];
    return row?.logo_data && row.logo_mime ? { data: row.logo_data, mime: row.logo_mime } : null;
  }

  async saveCompanyProfile(input: {
    tenantId: string;
    actorUserId: string;
    fields: CompanyProfileFields;
    logoData?: Buffer | null;
    logoMime?: 'image/png' | 'image/jpeg' | null;
    removeLogo: boolean;
  }): Promise<CompanyProfile | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tenant = await client.query(`SELECT id FROM tenants WHERE id = $1 FOR SHARE`, [input.tenantId]);
      if (!tenant.rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }
      const profile = input.fields;
      await client.query(`
        INSERT INTO tenant_company_profiles
          (tenant_id, legal_name, trade_name, cnpj, phone, email, postal_code, street,
            address_number, complement, district, city, state, logo_data, logo_mime, updated_by_user_id, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
        ON CONFLICT (tenant_id) DO UPDATE SET
          legal_name = EXCLUDED.legal_name, trade_name = EXCLUDED.trade_name, cnpj = EXCLUDED.cnpj,
          phone = EXCLUDED.phone, email = EXCLUDED.email, postal_code = EXCLUDED.postal_code,
          street = EXCLUDED.street, address_number = EXCLUDED.address_number,
          complement = EXCLUDED.complement, district = EXCLUDED.district, city = EXCLUDED.city,
          state = EXCLUDED.state,
          logo_data = CASE WHEN $17::boolean THEN NULL WHEN $14::bytea IS NULL THEN tenant_company_profiles.logo_data ELSE $14 END,
          logo_mime = CASE WHEN $17::boolean THEN NULL WHEN $14::bytea IS NULL THEN tenant_company_profiles.logo_mime ELSE $15 END,
          updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()
      `, [input.tenantId, profile.legalName, profile.tradeName, profile.cnpj, profile.phone, profile.email,
        profile.postalCode, profile.street, profile.addressNumber, profile.complement, profile.district,
        profile.city, profile.state, input.logoData ?? null, input.logoMime ?? null, input.actorUserId,
        input.removeLogo]);
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, $2, 'company_profile_updated', $3::jsonb)
      `, [input.actorUserId, input.tenantId, JSON.stringify({
        legalName: profile.legalName,
        cnpjConfigured: Boolean(profile.cnpj),
        logoChanged: input.removeLogo || Boolean(input.logoData),
        logoConfigured: input.removeLogo ? false : undefined
      })]);
      await client.query('COMMIT');
      return this.getCompanyProfile(input.tenantId);
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async getOfficialReportQueryAudit(tenantId: string, auditId: string): Promise<OfficialReportQueryAudit | null> {
    const result = await this.pool.query<{
      id: string; tenant_id: string; public_ip: string; searched_at: string; port: number | null; protocol: number | null;
    }>(`
      SELECT id, tenant_id, host(public_ip) AS public_ip, searched_at, port, protocol
      FROM query_audit WHERE tenant_id = $1 AND id = $2
    `, [tenantId, auditId]);
    const row = result.rows[0];
    return row ? {
      id: row.id,
      tenantId: row.tenant_id,
      publicIp: row.public_ip,
      searchedAt: new Date(row.searched_at).toISOString(),
      port: row.port === null ? null : Number(row.port),
      protocol: row.protocol === null ? null : Number(row.protocol)
    } : null;
  }

  async createOfficialReportJob(input: {
    tenantId: string;
    requestedByUserId: string;
    queryAuditId: string;
    selectedEventId: string;
    request: OfficialReportRequestSnapshot;
    cgnat: CgnatSearchRow;
    company: CompanyProfile;
    logo: { data: Buffer; mime: 'image/png' | 'image/jpeg' } | null;
    subscriber?: SubscriberSnapshot;
  }): Promise<string> {
    const result = await this.pool.query<{ id: string }>(`
      INSERT INTO official_report_jobs
        (tenant_id, requested_by_user_id, query_audit_id, selected_event_id, request_snapshot,
          cgnat_snapshot, company_snapshot, logo_data, logo_mime, subscriber_snapshot)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10::jsonb)
      RETURNING id
    `, [input.tenantId, input.requestedByUserId, input.queryAuditId, input.selectedEventId,
      JSON.stringify(input.request), JSON.stringify(input.cgnat), JSON.stringify(input.company),
      input.logo?.data ?? null, input.logo?.mime ?? null, JSON.stringify(input.subscriber ?? { status: 'erp_not_integrated' })]);
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Relatório para ofício não foi enfileirado');
    return id;
  }

  private mapOfficialReportJob(row: {
    id: string; tenant_id: string; requested_by_user_id: string; requested_by_name: string;
    query_audit_id: string; selected_event_id: string; status: OfficialReportJob['status'];
    request_snapshot: OfficialReportRequestSnapshot; cgnat_snapshot: CgnatSearchRow;
    company_snapshot: CompanyProfile; subscriber_snapshot: SubscriberSnapshot;
    pdf_sha256: string | null; error_message: string; requested_at: string; completed_at: string | null;
  }): OfficialReportJob {
    return {
      id: row.id, tenantId: row.tenant_id, requestedByUserId: row.requested_by_user_id,
      requestedByName: row.requested_by_name, queryAuditId: row.query_audit_id,
      selectedEventId: row.selected_event_id, status: row.status, request: row.request_snapshot,
      cgnat: row.cgnat_snapshot, company: row.company_snapshot, subscriber: row.subscriber_snapshot,
      sha256: row.pdf_sha256, errorMessage: row.error_message,
      requestedAt: new Date(row.requested_at).toISOString(),
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null
    };
  }

  async recoverInterruptedOfficialReports(): Promise<number> {
    const result = await this.pool.query(`
      UPDATE official_report_jobs SET status = 'pending', started_at = NULL,
        error_message = 'Processamento interrompido por reinício da API; reagendado automaticamente.'
      WHERE status = 'processing'
    `);
    return result.rowCount ?? 0;
  }

  async claimNextOfficialReport(): Promise<OfficialReportClaim | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<any>(`
        SELECT j.*, u.name AS requested_by_name
        FROM official_report_jobs j JOIN users u ON u.id = j.requested_by_user_id
        WHERE j.status = 'pending'
        ORDER BY j.requested_at
        FOR UPDATE OF j SKIP LOCKED LIMIT 1
      `);
      const row = result.rows[0];
      if (!row) {
        await client.query('COMMIT');
        return null;
      }
      await client.query(`UPDATE official_report_jobs SET status = 'processing', started_at = now(), error_message = '' WHERE id = $1`, [row.id]);
      await client.query('COMMIT');
      return {
        ...this.mapOfficialReportJob({ ...row, status: 'processing' }),
        logoData: row.logo_data ?? null,
        logoMime: row.logo_mime ?? null
      };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async completeOfficialReport(jobId: string, pdf: Buffer, sha256Hash: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ tenant_id: string; requested_by_user_id: string; query_audit_id: string }>(`
        UPDATE official_report_jobs SET status = 'ready', pdf_data = $2, pdf_sha256 = $3,
          completed_at = now(), error_message = ''
        WHERE id = $1 AND status = 'processing'
        RETURNING tenant_id, requested_by_user_id, query_audit_id
      `, [jobId, pdf, sha256Hash]);
      const row = result.rows[0];
      if (!row) throw new Error('Relatório não está em processamento');
      await client.query(`
        INSERT INTO export_audit (tenant_id, user_id, query_audit_id, format, sha256)
        VALUES ($1, $2, $3, 'official_pdf', $4)
      `, [row.tenant_id, row.requested_by_user_id, row.query_audit_id, sha256Hash]);
      await client.query('COMMIT');
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async failOfficialReport(jobId: string, message: string): Promise<void> {
    await this.pool.query(`
      UPDATE official_report_jobs SET status = 'failed', error_message = $2, completed_at = now()
      WHERE id = $1 AND status = 'processing'
    `, [jobId, message.slice(0, 2000)]);
  }

  async getOfficialReportJob(tenantId: string, jobId: string): Promise<OfficialReportJob | null> {
    const result = await this.pool.query<any>(`
      SELECT j.id, j.tenant_id, j.requested_by_user_id, u.name AS requested_by_name,
        j.query_audit_id, j.selected_event_id, j.status, j.request_snapshot, j.cgnat_snapshot,
        j.company_snapshot, j.subscriber_snapshot, j.pdf_sha256, j.error_message,
        j.requested_at, j.completed_at
      FROM official_report_jobs j JOIN users u ON u.id = j.requested_by_user_id
      WHERE j.tenant_id = $1 AND j.id = $2
    `, [tenantId, jobId]);
    return result.rows[0] ? this.mapOfficialReportJob(result.rows[0]) : null;
  }

  async listOfficialReportJobs(tenantId: string, limit: number): Promise<OfficialReportJob[]> {
    const result = await this.pool.query<any>(`
      SELECT j.id, j.tenant_id, j.requested_by_user_id, u.name AS requested_by_name,
        j.query_audit_id, j.selected_event_id, j.status, j.request_snapshot, j.cgnat_snapshot,
        j.company_snapshot, j.subscriber_snapshot, j.pdf_sha256, j.error_message,
        j.requested_at, j.completed_at
      FROM official_report_jobs j JOIN users u ON u.id = j.requested_by_user_id
      WHERE j.tenant_id = $1 ORDER BY j.requested_at DESC LIMIT $2
    `, [tenantId, limit]);
    return result.rows.map((row) => this.mapOfficialReportJob(row));
  }

  async getOfficialReportPdf(tenantId: string, jobId: string): Promise<{ pdf: Buffer; sha256: string } | null> {
    const result = await this.pool.query<{ pdf_data: Buffer; pdf_sha256: string }>(`
      SELECT pdf_data, pdf_sha256 FROM official_report_jobs
      WHERE tenant_id = $1 AND id = $2 AND status = 'ready'
    `, [tenantId, jobId]);
    const row = result.rows[0];
    return row ? { pdf: row.pdf_data, sha256: row.pdf_sha256 } : null;
  }

  async deleteReadyOfficialReport(input: {
    tenantId: string;
    reportId: string;
    actorUserId: string;
  }): Promise<'deleted' | 'not_found' | 'not_ready'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        status: OfficialReportJob['status']; query_audit_id: string; pdf_sha256: string | null;
      }>(`
        SELECT status, query_audit_id, pdf_sha256
        FROM official_report_jobs
        WHERE tenant_id = $1 AND id = $2
        FOR UPDATE
      `, [input.tenantId, input.reportId]);
      const report = result.rows[0];
      if (!report) {
        await client.query('ROLLBACK');
        return 'not_found';
      }
      if (report.status !== 'ready' || !report.pdf_sha256) {
        await client.query('ROLLBACK');
        return 'not_ready';
      }
      await client.query(`
        INSERT INTO official_report_deletion_audit
          (tenant_id, actor_user_id, report_id, query_audit_id, pdf_sha256)
        VALUES ($1, $2, $3, $4, $5)
      `, [input.tenantId, input.actorUserId, input.reportId, report.query_audit_id, report.pdf_sha256]);
      await client.query(`
        DELETE FROM official_report_jobs
        WHERE tenant_id = $1 AND id = $2 AND status = 'ready'
      `, [input.tenantId, input.reportId]);
      await client.query('COMMIT');
      return 'deleted';
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async getQueryPerformance(tenantId: string): Promise<{
    samples24h: number;
    averageMs: number | null;
    p95Ms: number | null;
    maximumMs: number | null;
  }> {
    const result = await this.pool.query<{
      samples_24h: string;
      average_ms: string | null;
      p95_ms: string | null;
      maximum_ms: number | null;
    }>(`
      SELECT
        count(duration_ms) AS samples_24h,
        round(avg(duration_ms), 1) AS average_ms,
        round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)) AS p95_ms,
        max(duration_ms) AS maximum_ms
      FROM query_audit
      WHERE tenant_id = $1
        AND created_at >= now() - INTERVAL '24 hours'
        AND duration_ms IS NOT NULL
    `, [tenantId]);
    const row = result.rows[0];
    return {
      samples24h: Number(row?.samples_24h ?? 0),
      averageMs: row?.average_ms === null || row?.average_ms === undefined ? null : Number(row.average_ms),
      p95Ms: row?.p95_ms === null || row?.p95_ms === undefined ? null : Number(row.p95_ms),
      maximumMs: row?.maximum_ms === null || row?.maximum_ms === undefined ? null : Number(row.maximum_ms)
    };
  }

  async auditExport(input: {
    tenantId: string;
    userId: string | null;
    queryAuditId: string;
    format: 'csv' | 'pdf' | 'official_pdf';
    sha256: string;
  }): Promise<string> {
    const result = await this.pool.query<{ id: string }>(`
      INSERT INTO export_audit (tenant_id, user_id, query_audit_id, format, sha256)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [input.tenantId, input.userId, input.queryAuditId, input.format, input.sha256]);
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Auditoria da exportação não foi criada');
    return id;
  }

  async getPlatformEmailSettings(): Promise<PlatformEmailSettings | null> {
    const result = await this.pool.query<{
      enabled: boolean; smtp_host: string; smtp_port: number; smtp_secure: boolean;
      smtp_user: string; smtp_password_secret: string; smtp_from: string;
      last_test_at: string | null; last_test_status: 'success' | 'failed' | null;
      last_test_error: string; updated_at: string;
    }>(`
      SELECT enabled, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password_secret, smtp_from,
        last_test_at, last_test_status, last_test_error, updated_at
      FROM platform_email_settings
      WHERE singleton = true
    `);
    const row = result.rows[0];
    if (!row) return null;
    return {
      enabled: row.enabled,
      host: row.smtp_host,
      port: row.smtp_port,
      secure: row.smtp_secure,
      user: row.smtp_user,
      passwordSecret: row.smtp_password_secret,
      from: row.smtp_from,
      lastTestAt: row.last_test_at ? new Date(row.last_test_at).toISOString() : null,
      lastTestStatus: row.last_test_status,
      lastTestError: row.last_test_error,
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }

  async savePlatformEmailSettings(input: {
    actorUserId: string;
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    passwordSecret: string;
    from: string;
    passwordChanged: boolean;
  }): Promise<PlatformEmailSettings> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO platform_email_settings
          (singleton, enabled, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password_secret, smtp_from, updated_by_user_id)
        VALUES (true, $1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (singleton) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          smtp_host = EXCLUDED.smtp_host,
          smtp_port = EXCLUDED.smtp_port,
          smtp_secure = EXCLUDED.smtp_secure,
          smtp_user = EXCLUDED.smtp_user,
          smtp_password_secret = EXCLUDED.smtp_password_secret,
          smtp_from = EXCLUDED.smtp_from,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = now()
      `, [
        input.enabled, input.host, input.port, input.secure, input.user,
        input.passwordSecret, input.from, input.actorUserId
      ]);
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, NULL, 'email_settings_updated', jsonb_build_object(
          'enabled', $2::boolean, 'host', $3::text, 'port', $4::integer,
          'secure', $5::boolean, 'from', $6::text, 'passwordChanged', $7::boolean
        ))
      `, [input.actorUserId, input.enabled, input.host, input.port, input.secure, input.from, input.passwordChanged]);
      await client.query('COMMIT');
      const settings = await this.getPlatformEmailSettings();
      if (!settings) throw new Error('Configuração de e-mail não foi salva');
      return settings;
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async recordPlatformEmailTest(input: {
    actorUserId: string;
    recipient: string;
    status: 'success' | 'failed';
    error: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE platform_email_settings
        SET last_test_at = now(), last_test_status = $1, last_test_error = $2
        WHERE singleton = true
      `, [input.status, input.error.slice(0, 2000)]);
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, NULL, 'email_tested', jsonb_build_object('recipient', $2::text, 'status', $3::text))
      `, [input.actorUserId, input.recipient, input.status]);
      await client.query('COMMIT');
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async getPlatformContinuitySettings(): Promise<PlatformContinuitySettings | null> {
    const result = await this.pool.query<{
      enabled: boolean; site_a_name: string; site_b_name: string; postgres_standby_url_secret: string;
      clickhouse_standby_url: string; clickhouse_standby_user: string; clickhouse_standby_password_secret: string;
      standby_api_url: string; warning_seconds: number; critical_seconds: number;
      routing: ContinuityRoutingSettings;
      last_test_at: string | null; last_test_status: 'success' | 'failed' | null; last_test_error: string; updated_at: string;
    }>(`
      SELECT enabled, site_a_name, site_b_name, postgres_standby_url_secret,
        clickhouse_standby_url, clickhouse_standby_user, clickhouse_standby_password_secret,
        standby_api_url, routing, warning_seconds, critical_seconds,
        last_test_at, last_test_status, last_test_error, updated_at
      FROM platform_continuity_settings WHERE singleton = true
    `);
    const row = result.rows[0];
    if (!row) return null;
    const legacyRouting = row.routing as ContinuityRoutingSettings & {
      siteAPrivateHost?: string; siteBPrivateHost?: string;
    };
    const routing: ContinuityRoutingSettings = {
      siteAHost: legacyRouting.siteAHost || legacyRouting.siteAPrivateHost || '',
      siteBHost: legacyRouting.siteBHost || legacyRouting.siteBPrivateHost || '',
      panelHost: legacyRouting.panelHost || '', ingestHost: legacyRouting.ingestHost || '',
      drControlHost: legacyRouting.drControlHost || '', dnsProvider: legacyRouting.dnsProvider || 'manual',
      dnsTtlSeconds: legacyRouting.dnsTtlSeconds || 300
    };
    return {
      enabled: row.enabled, siteAName: row.site_a_name, siteBName: row.site_b_name,
      postgresStandbyUrlSecret: row.postgres_standby_url_secret,
      clickhouseStandbyUrl: row.clickhouse_standby_url, clickhouseStandbyUser: row.clickhouse_standby_user,
      clickhouseStandbyPasswordSecret: row.clickhouse_standby_password_secret,
      standbyApiUrl: row.standby_api_url, routing, warningSeconds: row.warning_seconds, criticalSeconds: row.critical_seconds,
      lastTestAt: row.last_test_at ? new Date(row.last_test_at).toISOString() : null,
      lastTestStatus: row.last_test_status, lastTestError: row.last_test_error,
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }

  async savePlatformContinuitySettings(input: {
    actorUserId: string; enabled: boolean; siteAName: string; siteBName: string;
    postgresStandbyUrlSecret: string; clickhouseStandbyUrl: string; clickhouseStandbyUser: string;
    clickhouseStandbyPasswordSecret: string; standbyApiUrl: string;
    routing: ContinuityRoutingSettings;
    warningSeconds: number; criticalSeconds: number; connectionChanged: boolean;
  }): Promise<PlatformContinuitySettings> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO platform_continuity_settings
          (singleton, enabled, site_a_name, site_b_name, postgres_standby_url_secret,
           clickhouse_standby_url, clickhouse_standby_user, clickhouse_standby_password_secret,
           standby_api_url, routing, warning_seconds, critical_seconds, updated_by_user_id)
        VALUES (true, $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
        ON CONFLICT (singleton) DO UPDATE SET
          enabled = EXCLUDED.enabled, site_a_name = EXCLUDED.site_a_name, site_b_name = EXCLUDED.site_b_name,
          postgres_standby_url_secret = EXCLUDED.postgres_standby_url_secret,
          clickhouse_standby_url = EXCLUDED.clickhouse_standby_url,
          clickhouse_standby_user = EXCLUDED.clickhouse_standby_user,
          clickhouse_standby_password_secret = EXCLUDED.clickhouse_standby_password_secret,
          standby_api_url = EXCLUDED.standby_api_url,
          routing = EXCLUDED.routing,
          warning_seconds = EXCLUDED.warning_seconds, critical_seconds = EXCLUDED.critical_seconds,
          last_test_at = CASE WHEN $13::boolean THEN NULL ELSE platform_continuity_settings.last_test_at END,
          last_test_status = CASE WHEN $13::boolean THEN NULL ELSE platform_continuity_settings.last_test_status END,
          last_test_error = CASE WHEN $13::boolean THEN '' ELSE platform_continuity_settings.last_test_error END,
          updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()
      `, [input.enabled, input.siteAName, input.siteBName, input.postgresStandbyUrlSecret,
        input.clickhouseStandbyUrl, input.clickhouseStandbyUser, input.clickhouseStandbyPasswordSecret,
        input.standbyApiUrl, JSON.stringify(input.routing), input.warningSeconds, input.criticalSeconds, input.actorUserId, input.connectionChanged]);
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, NULL, 'continuity_settings_updated', jsonb_build_object(
          'enabled', $2::boolean, 'siteAName', $3::text, 'siteBName', $4::text,
          'clickhouseStandbyUrl', $5::text, 'standbyApiUrl', $6::text,
          'warningSeconds', $7::integer, 'criticalSeconds', $8::integer,
          'connectionChanged', $9::boolean
        ))
      `, [input.actorUserId, input.enabled, input.siteAName, input.siteBName,
        input.clickhouseStandbyUrl, input.standbyApiUrl, input.warningSeconds, input.criticalSeconds, input.connectionChanged]);
      await client.query('COMMIT');
      const settings = await this.getPlatformContinuitySettings();
      if (!settings) throw new Error('Configuração de continuidade não foi salva');
      return settings;
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally { client.release(); }
  }

  async recordPlatformContinuityTest(input: { actorUserId: string; status: 'success' | 'failed'; error: string }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE platform_continuity_settings
        SET last_test_at = now(), last_test_status = $1, last_test_error = $2
        WHERE singleton = true
      `, [input.status, input.error.slice(0, 2000)]);
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, NULL, 'continuity_tested', jsonb_build_object('status', $2::text))
      `, [input.actorUserId, input.status]);
      await client.query('COMMIT');
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally { client.release(); }
  }

  async activatePlatformContinuityAutomatically(): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ updated_by_user_id: string; site_a_name: string; site_b_name: string }>(`
        UPDATE platform_continuity_settings
        SET enabled = true, last_test_at = now(), last_test_status = 'success', last_test_error = '', updated_at = now()
        WHERE singleton = true AND enabled = false
        RETURNING updated_by_user_id, site_a_name, site_b_name
      `);
      const row = result.rows[0];
      if (!row) { await client.query('ROLLBACK'); return false; }
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES
          ($1, NULL, 'continuity_tested', jsonb_build_object('status', 'success', 'automatic', true)),
          ($1, NULL, 'continuity_settings_updated', jsonb_build_object(
            'enabled', true, 'siteAName', $2::text, 'siteBName', $3::text, 'automatic', true
          ))
      `, [row.updated_by_user_id, row.site_a_name, row.site_b_name]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally { client.release(); }
  }

  async createContinuityEnrollment(input: { actorUserId: string; tokenHash: string; expiresAt: string }): Promise<ContinuityEnrollment> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE continuity_enrollments SET status = 'revoked', token_hash = NULL WHERE status = 'pending'`);
      const result = await client.query<{ id: string; expires_at: string; created_at: string }>(`
        INSERT INTO continuity_enrollments (token_hash, status, expires_at, created_by_user_id)
        VALUES ($1, 'pending', $2, $3)
        RETURNING id, expires_at, created_at
      `, [input.tokenHash, input.expiresAt, input.actorUserId]);
      const row = result.rows[0];
      if (!row) throw new Error('Token de instalação não foi criado');
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, NULL, 'continuity_enrollment_created', jsonb_build_object('enrollmentId', $2::uuid, 'expiresAt', $3::timestamptz))
      `, [input.actorUserId, row.id, row.expires_at]);
      await client.query('COMMIT');
      return { id: row.id, status: 'pending', expiresAt: new Date(row.expires_at).toISOString(),
        createdAt: new Date(row.created_at).toISOString(), enrolledAt: null, inventory: null };
    } catch (error) { await this.safeRollback(client); throw error; }
    finally { client.release(); }
  }

  async getCurrentContinuityEnrollment(): Promise<ContinuityEnrollment | null> {
    const result = await this.pool.query<{
      id: string; status: ContinuityEnrollment['status']; expires_at: string; created_at: string;
      enrolled_at: string | null; inventory: Record<string, unknown> | null;
    }>(`
      SELECT id,
        CASE WHEN status = 'pending' AND expires_at <= now() THEN 'expired' ELSE status END AS status,
        expires_at, created_at, enrolled_at, inventory
      FROM continuity_enrollments ORDER BY created_at DESC LIMIT 1
    `);
    const row = result.rows[0];
    return row ? { id: row.id, status: row.status, expiresAt: new Date(row.expires_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(), enrolledAt: row.enrolled_at ? new Date(row.enrolled_at).toISOString() : null,
      inventory: row.inventory } : null;
  }

  async revokeContinuityEnrollment(input: { actorUserId: string; enrollmentId: string }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`
        UPDATE continuity_enrollments SET status = 'revoked', token_hash = NULL
        WHERE id = $1 AND status = 'pending' AND expires_at > now()
      `, [input.enrollmentId]);
      if (result.rowCount === 1) await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, NULL, 'continuity_enrollment_revoked', jsonb_build_object('enrollmentId', $2::uuid))
      `, [input.actorUserId, input.enrollmentId]);
      await client.query('COMMIT');
      return result.rowCount === 1;
    } catch (error) { await this.safeRollback(client); throw error; }
    finally { client.release(); }
  }

  async consumeContinuityEnrollment(input: {
    tokenHash: string; inventory: Record<string, unknown>;
    postgresMonitorPassword: string;
    siteAName: string; siteBName: string; postgresStandbyUrlSecret: string;
    clickhouseStandbyUrl: string; clickhouseStandbyUser: string; clickhouseStandbyPasswordSecret: string;
    standbyApiUrl: string; routing: ContinuityRoutingSettings; warningSeconds: number; criticalSeconds: number;
  }): Promise<'enrolled' | 'invalid'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const enrollment = await client.query<{ id: string; created_by_user_id: string }>(`
        UPDATE continuity_enrollments
        SET status = 'enrolled', enrolled_at = now(), inventory = $2::jsonb, token_hash = NULL
        WHERE token_hash = $1 AND status = 'pending' AND expires_at > now()
        RETURNING id, created_by_user_id
      `, [input.tokenHash, JSON.stringify(input.inventory)]);
      const row = enrollment.rows[0];
      if (!row) { await client.query('ROLLBACK'); return 'invalid'; }
      const role = await client.query<{ ddl: string }>(`
        SELECT format(
          CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'argus_monitor')
            THEN 'ALTER ROLE argus_monitor WITH LOGIN PASSWORD %L'
            ELSE 'CREATE ROLE argus_monitor WITH LOGIN PASSWORD %L'
          END,
          $1::text
        ) AS ddl
      `, [input.postgresMonitorPassword]);
      if (!role.rows[0]?.ddl) throw new Error('Comando da conta de monitoramento não foi gerado');
      await client.query(role.rows[0].ddl);
      await client.query('GRANT pg_monitor TO argus_monitor');
      await client.query('GRANT CONNECT ON DATABASE argus TO argus_monitor');
      await client.query(`
        INSERT INTO platform_continuity_settings
          (singleton, enabled, site_a_name, site_b_name, postgres_standby_url_secret,
           clickhouse_standby_url, clickhouse_standby_user, clickhouse_standby_password_secret,
           standby_api_url, routing, warning_seconds, critical_seconds, updated_by_user_id)
        VALUES (true, false, $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
        ON CONFLICT (singleton) DO UPDATE SET
          enabled = false, site_a_name = EXCLUDED.site_a_name, site_b_name = EXCLUDED.site_b_name,
          postgres_standby_url_secret = EXCLUDED.postgres_standby_url_secret,
          clickhouse_standby_url = EXCLUDED.clickhouse_standby_url,
          clickhouse_standby_user = EXCLUDED.clickhouse_standby_user,
          clickhouse_standby_password_secret = EXCLUDED.clickhouse_standby_password_secret,
          standby_api_url = EXCLUDED.standby_api_url, routing = EXCLUDED.routing, warning_seconds = EXCLUDED.warning_seconds,
          critical_seconds = EXCLUDED.critical_seconds, last_test_at = NULL, last_test_status = NULL,
          last_test_error = '', updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()
      `, [input.siteAName, input.siteBName, input.postgresStandbyUrlSecret, input.clickhouseStandbyUrl,
        input.clickhouseStandbyUser, input.clickhouseStandbyPasswordSecret, input.standbyApiUrl,
        JSON.stringify(input.routing), input.warningSeconds, input.criticalSeconds, row.created_by_user_id]);
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, NULL, 'continuity_enrolled', jsonb_build_object(
          'enrollmentId', $2::uuid, 'hostname', $3::text, 'vcpu', $4::integer, 'memoryGiB', $5::integer
        ))
      `, [row.created_by_user_id, row.id, String(input.inventory.hostname ?? ''),
        Number(input.inventory.vcpu ?? 0), Number(input.inventory.memoryGiB ?? 0)]);
      await client.query('COMMIT');
      return 'enrolled';
    } catch (error) { await this.safeRollback(client); throw error; }
    finally { client.release(); }
  }

  async getErpIntegration(tenantId: string, provider: string): Promise<ErpIntegrationRecord | null> {
    const result = await this.pool.query<{
      tenant_id: string; provider: string; base_url: string; secret_ref: string;
      settings: Record<string, unknown>; enabled: boolean; created_at: string;
    }>(`
      SELECT tenant_id, provider, base_url, secret_ref, settings, enabled, created_at
      FROM erp_integrations
      WHERE tenant_id = $1 AND provider = $2
    `, [tenantId, provider]);
    const row = result.rows[0];
    return row ? {
      tenantId: row.tenant_id,
      provider: row.provider,
      baseUrl: row.base_url,
      secretRef: row.secret_ref,
      settings: row.settings ?? {},
      enabled: row.enabled,
      createdAt: new Date(row.created_at).toISOString()
    } : null;
  }

  async listPlatformIntegrationProviders(): Promise<PlatformIntegrationProvider[]> {
    const result = await this.pool.query<{
      provider: string; enabled: boolean; configured_tenants: string; enabled_tenants: string; updated_at: string | null;
    }>(`
      SELECT p.provider, p.enabled,
        count(e.tenant_id)::text AS configured_tenants,
        count(e.tenant_id) FILTER (WHERE e.enabled)::text AS enabled_tenants,
        p.updated_at
      FROM platform_integration_providers p
      LEFT JOIN erp_integrations e ON e.provider = p.provider
      GROUP BY p.provider, p.enabled, p.updated_at
      ORDER BY p.provider
    `);
    return result.rows.map((row) => ({
      provider: row.provider,
      enabled: row.enabled,
      configuredTenants: Number(row.configured_tenants),
      enabledTenants: Number(row.enabled_tenants),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    }));
  }

  async isIntegrationProviderEnabled(provider: string): Promise<boolean> {
    const result = await this.pool.query<{ enabled: boolean }>(`
      SELECT enabled FROM platform_integration_providers WHERE provider = $1
    `, [provider]);
    return result.rows[0]?.enabled ?? false;
  }

  async setPlatformIntegrationProvider(input: {
    provider: string;
    enabled: boolean;
    actorUserId: string;
  }): Promise<PlatformIntegrationProvider> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query<{ provider: string }>(`
        UPDATE platform_integration_providers
        SET enabled = $2, updated_by_user_id = $3, updated_at = now()
        WHERE provider = $1
        RETURNING provider
      `, [input.provider, input.enabled, input.actorUserId]);
      if (!updated.rowCount) throw new Error('integration_provider_not_found');
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, NULL, $2, jsonb_build_object('provider', $3::text, 'enabled', $4::boolean))
      `, [
        input.actorUserId,
        input.enabled ? 'integration_provider_enabled' : 'integration_provider_disabled',
        input.provider,
        input.enabled
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally {
      client.release();
    }
    const providers = await this.listPlatformIntegrationProviders();
    const provider = providers.find((item) => item.provider === input.provider);
    if (!provider) throw new Error('integration_provider_not_found');
    return provider;
  }

  async saveErpIntegration(input: {
    tenantId: string;
    provider: string;
    baseUrl: string;
    secretRef: string;
    settings: Record<string, unknown>;
    enabled: boolean;
  }): Promise<ErpIntegrationRecord> {
    await this.pool.query(`
      INSERT INTO erp_integrations (tenant_id, provider, base_url, secret_ref, settings, enabled)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      ON CONFLICT (tenant_id, provider) DO UPDATE SET
        base_url = EXCLUDED.base_url,
        secret_ref = EXCLUDED.secret_ref,
        settings = EXCLUDED.settings,
        enabled = EXCLUDED.enabled
    `, [input.tenantId, input.provider, input.baseUrl, input.secretRef, JSON.stringify(input.settings), input.enabled]);
    const integration = await this.getErpIntegration(input.tenantId, input.provider);
    if (!integration) throw new Error('A integração ERP não foi salva');
    return integration;
  }

  async deleteErpIntegration(tenantId: string, provider: string): Promise<boolean> {
    const result = await this.pool.query(`
      DELETE FROM erp_integrations
      WHERE tenant_id = $1 AND provider = $2
    `, [tenantId, provider]);
    return result.rowCount === 1;
  }

  private alertSettingsFromRow(row: {
    id: string; tenant_id: string; tenant_name: string; enabled: boolean;
    destination_type: 'generic' | 'discord' | 'telegram'; destination_secret: string; telegram_chat_id: string;
    minimum_severity: 'warning' | 'critical'; enabled_sources: AlertSource[];
    reminder_minutes: number; recovery_enabled: boolean; last_test_at: string | null;
    last_test_status: 'success' | 'failed' | null; last_test_error: string; updated_at: string | null;
  }): AlertNotificationSettings {
    return {
      id: row.id, tenantId: row.tenant_id, tenantName: row.tenant_name, enabled: row.enabled,
      destinationType: row.destination_type, destinationSecret: row.destination_secret,
      telegramChatId: row.telegram_chat_id, minimumSeverity: row.minimum_severity,
      enabledSources: row.enabled_sources, reminderMinutes: Number(row.reminder_minutes),
      recoveryEnabled: row.recovery_enabled, lastTestAt: row.last_test_at,
      lastTestStatus: row.last_test_status, lastTestError: row.last_test_error, updatedAt: row.updated_at
    };
  }

  async listAlertNotificationSettings(tenantId: string): Promise<AlertNotificationSettings[]> {
    const result = await this.pool.query<{
      id: string; tenant_id: string; tenant_name: string; enabled: boolean;
      destination_type: 'generic' | 'discord' | 'telegram'; destination_secret: string; telegram_chat_id: string;
      minimum_severity: 'warning' | 'critical'; enabled_sources: AlertSource[];
      reminder_minutes: number; recovery_enabled: boolean; last_test_at: string | null;
      last_test_status: 'success' | 'failed' | null; last_test_error: string; updated_at: string | null;
    }>(`
      SELECT s.id, s.tenant_id, t.name AS tenant_name, s.enabled, s.destination_type,
        s.destination_secret, s.telegram_chat_id, s.minimum_severity, s.enabled_sources,
        s.reminder_minutes, s.recovery_enabled, s.last_test_at, s.last_test_status,
        s.last_test_error, s.updated_at
      FROM alert_notification_settings s
      JOIN tenants t ON t.id = s.tenant_id
      WHERE s.tenant_id = $1
      ORDER BY CASE s.destination_type WHEN 'generic' THEN 1 WHEN 'discord' THEN 2 ELSE 3 END
    `, [tenantId]);
    return result.rows.map((row) => this.alertSettingsFromRow(row));
  }

  async getAlertNotificationSetting(tenantId: string, settingId: string): Promise<AlertNotificationSettings | null> {
    const result = await this.pool.query<{
      id: string; tenant_id: string; tenant_name: string; enabled: boolean;
      destination_type: 'generic' | 'discord' | 'telegram'; destination_secret: string; telegram_chat_id: string;
      minimum_severity: 'warning' | 'critical'; enabled_sources: AlertSource[];
      reminder_minutes: number; recovery_enabled: boolean; last_test_at: string | null;
      last_test_status: 'success' | 'failed' | null; last_test_error: string; updated_at: string | null;
    }>(`
      SELECT s.id, s.tenant_id, t.name AS tenant_name, s.enabled, s.destination_type,
        s.destination_secret, s.telegram_chat_id, s.minimum_severity, s.enabled_sources,
        s.reminder_minutes, s.recovery_enabled, s.last_test_at, s.last_test_status,
        s.last_test_error, s.updated_at
      FROM alert_notification_settings s
      JOIN tenants t ON t.id = s.tenant_id
      WHERE s.tenant_id = $1 AND s.id = $2
    `, [tenantId, settingId]);
    return result.rows[0] ? this.alertSettingsFromRow(result.rows[0]) : null;
  }

  async createAlertNotificationSetting(input: {
    tenantId: string; actorUserId: string; enabled: boolean;
    destinationType: 'generic' | 'discord' | 'telegram'; destinationSecret: string; telegramChatId: string;
    minimumSeverity: 'warning' | 'critical'; enabledSources: AlertSource[];
    reminderMinutes: number; recoveryEnabled: boolean;
  }): Promise<AlertNotificationSettings> {
    const result = await this.pool.query<{ id: string }>(`
      INSERT INTO alert_notification_settings
        (tenant_id, enabled, destination_type, destination_secret, telegram_chat_id,
          minimum_severity, enabled_sources, reminder_minutes, recovery_enabled, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10)
      RETURNING id
    `, [input.tenantId, input.enabled, input.destinationType, input.destinationSecret, input.telegramChatId,
      input.minimumSeverity, input.enabledSources, input.reminderMinutes, input.recoveryEnabled, input.actorUserId]);
    const setting = await this.getAlertNotificationSetting(input.tenantId, result.rows[0]?.id ?? '');
    if (!setting) throw new Error('A configuração de alerta não foi criada');
    return setting;
  }

  async updateAlertNotificationSetting(input: {
    id: string; tenantId: string; actorUserId: string; enabled: boolean;
    destinationType: 'generic' | 'discord' | 'telegram'; destinationSecret: string; telegramChatId: string;
    minimumSeverity: 'warning' | 'critical'; enabledSources: AlertSource[];
    reminderMinutes: number; recoveryEnabled: boolean;
  }): Promise<AlertNotificationSettings | null> {
    const result = await this.pool.query(`
      UPDATE alert_notification_settings
      SET enabled = $3, destination_type = $4, destination_secret = $5, telegram_chat_id = $6,
        minimum_severity = $7, enabled_sources = $8::text[], reminder_minutes = $9,
        recovery_enabled = $10, updated_by = $11, updated_at = now()
      WHERE tenant_id = $1 AND id = $2
    `, [input.tenantId, input.id, input.enabled, input.destinationType, input.destinationSecret,
      input.telegramChatId, input.minimumSeverity, input.enabledSources, input.reminderMinutes,
      input.recoveryEnabled, input.actorUserId]);
    if (result.rowCount !== 1) return null;
    return this.getAlertNotificationSetting(input.tenantId, input.id);
  }

  async deleteAlertNotificationSetting(tenantId: string, settingId: string): Promise<boolean> {
    const result = await this.pool.query(`
      DELETE FROM alert_notification_settings WHERE tenant_id = $1 AND id = $2
    `, [tenantId, settingId]);
    return result.rowCount === 1;
  }

  async listEnabledAlertNotificationSettings(): Promise<AlertNotificationSettings[]> {
    const result = await this.pool.query<{ tenant_id: string; id: string }>(`
      SELECT s.tenant_id, s.id
      FROM alert_notification_settings s
      JOIN tenants t ON t.id = s.tenant_id
      WHERE s.enabled = true AND t.active = true AND s.destination_secret <> ''
      ORDER BY s.tenant_id, s.id
    `);
    const settings = await Promise.all(result.rows.map((row) => this.getAlertNotificationSetting(row.tenant_id, row.id)));
    return settings.filter((setting): setting is AlertNotificationSettings => Boolean(setting));
  }

  async recordAlertWebhookTest(tenantId: string, settingId: string, status: 'success' | 'failed', error: string): Promise<void> {
    await this.pool.query(`
      UPDATE alert_notification_settings
      SET last_test_at = now(), last_test_status = $3, last_test_error = $4, updated_at = now()
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, settingId, status, error.slice(0, 1000)]);
  }

  async listAlertDeliveryStates(tenantId: string, settingId: string): Promise<AlertDeliveryState[]> {
    const result = await this.pool.query<{
      notification_setting_id: string; alert_id: string; source: AlertSource; severity: 'warning' | 'critical'; title: string; detail: string;
      active: boolean; first_seen_at: string; last_seen_at: string; last_notified_at: string | null; resolved_at: string | null;
    }>(`
      SELECT notification_setting_id, alert_id, source, severity, title, detail, active,
        first_seen_at, last_seen_at, last_notified_at, resolved_at
      FROM alert_delivery_state WHERE tenant_id = $1 AND notification_setting_id = $2
    `, [tenantId, settingId]);
    return result.rows.map((row) => ({
      notificationSettingId: row.notification_setting_id, alertId: row.alert_id,
      source: row.source, severity: row.severity, title: row.title, detail: row.detail,
      active: row.active, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at,
      lastNotifiedAt: row.last_notified_at, resolvedAt: row.resolved_at
    }));
  }

  async listActiveAlertDismissals(tenantId: string): Promise<string[]> {
    const result = await this.pool.query<{ alert_id: string }>(`
      SELECT alert_id FROM alert_dismissals WHERE tenant_id = $1 AND active = true
    `, [tenantId]);
    return result.rows.map((row) => row.alert_id);
  }

  async dismissOperationalAlert(input: { tenantId: string; alertId: string; actorUserId: string }): Promise<void> {
    await this.pool.query(`
      INSERT INTO alert_dismissals (tenant_id, alert_id, actor_user_id, active, dismissed_at, resolved_at)
      VALUES ($1, $2, $3, true, now(), NULL)
      ON CONFLICT (tenant_id, alert_id) DO UPDATE SET
        actor_user_id = EXCLUDED.actor_user_id, active = true, dismissed_at = now(), resolved_at = NULL
    `, [input.tenantId, input.alertId, input.actorUserId]);
  }

  async reconcileAlertDismissals(tenantId: string, activeAlertIds: string[]): Promise<void> {
    await this.pool.query(`
      UPDATE alert_dismissals
      SET active = false, resolved_at = now()
      WHERE tenant_id = $1 AND active = true AND NOT (alert_id = ANY($2::text[]))
    `, [tenantId, activeAlertIds]);
  }

  async saveActiveAlertState(input: {
    tenantId: string; settingId: string; alert: { id: string; source: AlertSource; severity: 'warning' | 'critical'; title: string; detail: string };
    observedAt: string; notifiedAt: string | null;
  }): Promise<void> {
    await this.pool.query(`
      INSERT INTO alert_delivery_state
        (tenant_id, notification_setting_id, alert_id, source, severity, title, detail, active, first_seen_at, last_seen_at, last_notified_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $8, $9)
      ON CONFLICT (tenant_id, notification_setting_id, alert_id) DO UPDATE SET
        source = EXCLUDED.source, severity = EXCLUDED.severity, title = EXCLUDED.title, detail = EXCLUDED.detail,
        active = true, last_seen_at = EXCLUDED.last_seen_at, resolved_at = NULL,
        last_notified_at = COALESCE(EXCLUDED.last_notified_at, alert_delivery_state.last_notified_at)
    `, [input.tenantId, input.settingId, input.alert.id, input.alert.source, input.alert.severity,
      input.alert.title, input.alert.detail, input.observedAt, input.notifiedAt]);
  }

  async resolveAlertState(tenantId: string, settingId: string, alertId: string, resolvedAt: string, notifiedAt: string | null): Promise<void> {
    await this.pool.query(`
      UPDATE alert_delivery_state
      SET active = false, resolved_at = $4,
        last_notified_at = COALESCE($5::timestamptz, last_notified_at)
      WHERE tenant_id = $1 AND notification_setting_id = $2 AND alert_id = $3
    `, [tenantId, settingId, alertId, resolvedAt, notifiedAt]);
  }

  async getPlatformBackupDestination(): Promise<PlatformBackupDestination | null> {
    const result = await this.pool.query<{
      enabled: boolean; provider: 'google_drive'; folder_id: string; service_account_secret: string;
      encryption_passphrase_secret: string; retention_days: number; last_test_at: string | null;
      last_test_status: 'success' | 'failed' | null; last_test_error: string; updated_at: string;
    }>(`
      SELECT enabled, provider, folder_id, service_account_secret, encryption_passphrase_secret,
        retention_days, last_test_at, last_test_status, last_test_error, updated_at
      FROM platform_backup_destinations WHERE singleton = true
    `);
    const row = result.rows[0];
    if (!row) return null;
    return {
      enabled: row.enabled, provider: row.provider, folderId: row.folder_id,
      serviceAccountSecret: row.service_account_secret,
      encryptionPassphraseSecret: row.encryption_passphrase_secret,
      retentionDays: row.retention_days,
      lastTestAt: row.last_test_at ? new Date(row.last_test_at).toISOString() : null,
      lastTestStatus: row.last_test_status, lastTestError: row.last_test_error,
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }

  async savePlatformBackupDestination(input: {
    actorUserId: string; enabled: boolean; folderId: string; serviceAccountSecret: string;
    encryptionPassphraseSecret: string; retentionDays: number; credentialsChanged: boolean; passphraseChanged: boolean;
  }): Promise<PlatformBackupDestination> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO platform_backup_destinations
          (singleton, enabled, provider, folder_id, service_account_secret, encryption_passphrase_secret,
           retention_days, updated_by_user_id)
        VALUES (true, $1, 'google_drive', $2, $3, $4, $5, $6)
        ON CONFLICT (singleton) DO UPDATE SET
          enabled = EXCLUDED.enabled, folder_id = EXCLUDED.folder_id,
          service_account_secret = EXCLUDED.service_account_secret,
          encryption_passphrase_secret = EXCLUDED.encryption_passphrase_secret,
          retention_days = EXCLUDED.retention_days, updated_by_user_id = EXCLUDED.updated_by_user_id,
          last_test_at = NULL, last_test_status = NULL, last_test_error = '', updated_at = now()
      `, [input.enabled, input.folderId, input.serviceAccountSecret, input.encryptionPassphraseSecret,
        input.retentionDays, input.actorUserId]);
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, NULL, 'backup_destination_updated', jsonb_build_object(
          'enabled', $2::boolean, 'provider', 'google_drive', 'retentionDays', $3::integer,
          'credentialsChanged', $4::boolean, 'passphraseChanged', $5::boolean
        ))
      `, [input.actorUserId, input.enabled, input.retentionDays, input.credentialsChanged, input.passphraseChanged]);
      await client.query('COMMIT');
      const saved = await this.getPlatformBackupDestination();
      if (!saved) throw new Error('Destino de backup não foi salvo');
      return saved;
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally { client.release(); }
  }

  async recordPlatformBackupDestinationTest(input: {
    actorUserId: string; status: 'success' | 'failed'; error: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE platform_backup_destinations
        SET last_test_at = now(), last_test_status = $1, last_test_error = $2
        WHERE singleton = true
      `, [input.status, input.error.slice(0, 2000)]);
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, target_tenant_id, action, details)
        VALUES ($1, NULL, 'backup_destination_tested', jsonb_build_object('provider', 'google_drive', 'status', $2::text))
      `, [input.actorUserId, input.status]);
      await client.query('COMMIT');
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally { client.release(); }
  }

  async createTenantBackupJob(input: { tenantId: string; actorUserId: string; sendToGoogleDrive: boolean }): Promise<TenantBackupJob | 'active_exists'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<TenantBackupJobRow>(`
        WITH inserted AS (
          INSERT INTO tenant_backup_jobs (tenant_id, requested_by_user_id, send_to_google_drive)
          VALUES ($1, $2, $3)
          RETURNING *
        )
        SELECT inserted.*, tenants.name AS tenant_name FROM inserted JOIN tenants ON tenants.id = inserted.tenant_id
      `, [input.tenantId, input.actorUserId, input.sendToGoogleDrive]);
      const row = result.rows[0];
      if (!row) throw new Error('Backup do cliente não foi criado');
      await client.query(`
        INSERT INTO system_backup_audit (tenant_id, actor_user_id, backup_id, action, total_bytes, user_agent)
        VALUES ($1, $2, $3, 'tenant_backup_requested', 0, '')
      `, [input.tenantId, input.actorUserId, row.id]);
      await client.query('COMMIT');
      return mapTenantBackupJob(row);
    } catch (error) {
      await this.safeRollback(client);
      if (typeof error === 'object' && error !== null && 'code' in error && String((error as { code: unknown }).code) === '23505') return 'active_exists';
      throw error;
    } finally { client.release(); }
  }

  async listTenantBackupJobs(tenantId: string, limit = 20): Promise<TenantBackupJob[]> {
    const result = await this.pool.query<TenantBackupJobRow>(`
      SELECT jobs.*, tenants.name AS tenant_name
      FROM tenant_backup_jobs jobs JOIN tenants ON tenants.id = jobs.tenant_id
      WHERE jobs.tenant_id = $1 ORDER BY jobs.requested_at DESC LIMIT $2
    `, [tenantId, limit]);
    return result.rows.map(mapTenantBackupJob);
  }

  async getTenantBackupJob(tenantId: string, jobId: string): Promise<TenantBackupJob | null> {
    const result = await this.pool.query<TenantBackupJobRow>(`
      SELECT jobs.*, tenants.name AS tenant_name
      FROM tenant_backup_jobs jobs JOIN tenants ON tenants.id = jobs.tenant_id
      WHERE jobs.tenant_id = $1 AND jobs.id = $2
    `, [tenantId, jobId]);
    return result.rows[0] ? mapTenantBackupJob(result.rows[0]) : null;
  }

  async claimNextTenantBackup(): Promise<TenantBackupJob | null> {
    const result = await this.pool.query<TenantBackupJobRow>(`
      WITH candidate AS (
        SELECT id FROM tenant_backup_jobs WHERE status = 'pending' ORDER BY requested_at FOR UPDATE SKIP LOCKED LIMIT 1
      ), updated AS (
        UPDATE tenant_backup_jobs jobs SET status = 'processing', started_at = now(), error_message = ''
        FROM candidate WHERE jobs.id = candidate.id RETURNING jobs.*
      )
      SELECT updated.*, tenants.name AS tenant_name FROM updated JOIN tenants ON tenants.id = updated.tenant_id
    `);
    return result.rows[0] ? mapTenantBackupJob(result.rows[0]) : null;
  }

  async completeTenantBackup(input: {
    jobId: string; archiveName: string; byteCount: number; sha256: string; googleDriveFileId: string | null;
  }): Promise<void> {
    await this.pool.query(`
      UPDATE tenant_backup_jobs SET status = 'ready', archive_name = $2, byte_count = $3, sha256 = $4,
        google_drive_file_id = $5, completed_at = now(), expires_at = now() + interval '7 days'
      WHERE id = $1 AND status = 'processing'
    `, [input.jobId, input.archiveName, input.byteCount, input.sha256, input.googleDriveFileId]);
  }

  async failTenantBackup(jobId: string, error: string): Promise<void> {
    await this.pool.query(`
      UPDATE tenant_backup_jobs SET status = 'failed', error_message = $2, completed_at = now()
      WHERE id = $1 AND status IN ('pending', 'processing')
    `, [jobId, error.slice(0, 2000)]);
  }

  async recoverInterruptedTenantBackups(): Promise<void> {
    await this.pool.query(`
      UPDATE tenant_backup_jobs SET status = 'pending', started_at = NULL,
        error_message = 'Processamento retomado após reinício'
      WHERE status = 'processing'
    `);
  }

  async getExternalBackupUpload(scope: 'platform' | 'tenant', sourceBackupId: string): Promise<{
    status: 'uploading' | 'success' | 'failed'; remoteFileId: string | null; errorMessage: string;
  } | null> {
    const result = await this.pool.query<{
      status: 'uploading' | 'success' | 'failed'; remote_file_id: string | null; error_message: string;
    }>(`
      SELECT status, remote_file_id, error_message FROM external_backup_uploads
      WHERE scope = $1 AND source_backup_id = $2 AND provider = 'google_drive'
    `, [scope, sourceBackupId]);
    const row = result.rows[0];
    return row ? { status: row.status, remoteFileId: row.remote_file_id, errorMessage: row.error_message } : null;
  }

  async getLatestExternalBackupUpload(scope: 'platform' | 'tenant', tenantId: string | null = null): Promise<{
    sourceBackupId: string; status: 'uploading' | 'success' | 'failed'; remoteFileId: string | null;
    errorMessage: string; startedAt: string; completedAt: string | null;
  } | null> {
    const result = await this.pool.query<{
      source_backup_id: string; status: 'uploading' | 'success' | 'failed'; remote_file_id: string | null;
      error_message: string; started_at: string; completed_at: string | null;
    }>(`
      SELECT source_backup_id, status, remote_file_id, error_message, started_at, completed_at
      FROM external_backup_uploads
      WHERE scope = $1 AND ($2::uuid IS NULL OR tenant_id = $2)
      ORDER BY started_at DESC LIMIT 1
    `, [scope, tenantId]);
    const row = result.rows[0];
    return row ? {
      sourceBackupId: row.source_backup_id, status: row.status, remoteFileId: row.remote_file_id,
      errorMessage: row.error_message, startedAt: new Date(row.started_at).toISOString(),
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null
    } : null;
  }

  async beginExternalBackupUpload(input: { scope: 'platform' | 'tenant'; sourceBackupId: string; tenantId: string | null }): Promise<void> {
    await this.pool.query(`
      INSERT INTO external_backup_uploads (scope, source_backup_id, tenant_id, provider, status)
      VALUES ($1, $2, $3, 'google_drive', 'uploading')
      ON CONFLICT (scope, source_backup_id, provider) DO UPDATE SET
        status = 'uploading', error_message = '', started_at = now(), completed_at = NULL
    `, [input.scope, input.sourceBackupId, input.tenantId]);
  }

  async completeExternalBackupUpload(input: {
    scope: 'platform' | 'tenant'; sourceBackupId: string; byteCount: number; sha256: string; remoteFileId: string;
  }): Promise<void> {
    await this.pool.query(`
      UPDATE external_backup_uploads SET status = 'success', byte_count = $3, sha256 = $4,
        remote_file_id = $5, completed_at = now(), error_message = ''
      WHERE scope = $1 AND source_backup_id = $2 AND provider = 'google_drive'
    `, [input.scope, input.sourceBackupId, input.byteCount, input.sha256, input.remoteFileId]);
  }

  async failExternalBackupUpload(scope: 'platform' | 'tenant', sourceBackupId: string, error: string): Promise<void> {
    await this.pool.query(`
      UPDATE external_backup_uploads SET status = 'failed', error_message = $3, completed_at = now()
      WHERE scope = $1 AND source_backup_id = $2 AND provider = 'google_drive'
    `, [scope, sourceBackupId, error.slice(0, 2000)]);
  }

  async exportTenantSnapshot(tenantId: string): Promise<Record<string, unknown>> {
    const tenant = await this.pool.query<{ data: Record<string, unknown> }>(
      `SELECT to_jsonb(tenants) AS data FROM tenants WHERE id = $1`, [tenantId]
    );
    if (!tenant.rows[0]) throw new Error('Cliente não encontrado');
    const tables = [
      'users', 'collectors', 'devices', 'erp_integrations', 'sync_batches', 'query_audit', 'export_audit',
      'auth_audit', 'collector_telemetry', 'user_management_audit', 'device_management_audit',
      'collector_management_audit', 'system_backup_audit', 'tenant_plan_assignments', 'device_discovery_sessions',
      'alert_notification_settings', 'alert_delivery_state', 'tenant_company_profiles', 'official_report_jobs',
      'official_report_deletion_audit', 'collector_firewall_policies', 'collector_firewall_authorizations',
      'collector_firewall_observations', 'collector_firewall_audit'
    ] as const;
    const snapshot: Record<string, unknown> = { tenant: tenant.rows[0].data };
    const sensitiveKey = /(password|secret|token|api_key_hash|pdf_data|logo_data)/i;
    const sanitize = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(sanitize);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !sensitiveKey.test(key)).map(([key, nested]) => [key, sanitize(nested)]));
    };
    for (const table of tables) {
      const rows = await this.pool.query<{ data: Record<string, unknown> }>(
        `SELECT to_jsonb(source) AS data FROM ${table} source WHERE tenant_id = $1`, [tenantId]
      );
      snapshot[table] = rows.rows.map((row) => sanitize(row.data));
    }
    return sanitize(snapshot) as Record<string, unknown>;
  }

  async auditBackupDownload(input: {
    tenantId: string;
    actorUserId: string;
    backupId: string;
    totalBytes: number;
    ipAddress: string | null;
    userAgent: string;
    action?: 'download_started' | 'tenant_backup_downloaded';
  }): Promise<string> {
    const result = await this.pool.query<{ id: string }>(`
      INSERT INTO system_backup_audit
        (tenant_id, actor_user_id, backup_id, action, total_bytes, ip_address, user_agent)
      VALUES ($1, $2, $3, $7, $4, $5, $6)
      RETURNING id
    `, [input.tenantId, input.actorUserId, input.backupId, input.totalBytes, input.ipAddress, input.userAgent,
      input.action ?? 'download_started']);
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Auditoria do download de backup não foi criada');
    return id;
  }

  async listAuditTimeline(input: {
    tenantId: string;
    category: 'all' | AuditTimelineEvent['category'];
    limit: number;
  }): Promise<{
    events: AuditTimelineEvent[];
    summary: { searches24h: number; exports24h: number; loginFailures24h: number; userChanges24h: number; deviceChanges24h: number; collectorChanges24h: number };
  }> {
    const [eventsResult, summaryResult] = await Promise.all([
      this.pool.query<{
        id: string;
        category: AuditTimelineEvent['category'];
        action: string;
        actor_name: string | null;
        actor_email: string;
        created_at: string;
        details: Record<string, unknown>;
      }>(`
        SELECT id, category, action, actor_name, actor_email, created_at, details
        FROM (
          SELECT
            q.id, 'search'::text AS category, 'searched'::text AS action,
            u.name AS actor_name, COALESCE(u.email, 'usuário removido') AS actor_email,
            q.created_at,
            jsonb_build_object(
              'publicIp', host(q.public_ip), 'searchedAt', q.searched_at,
              'port', q.port, 'protocol', q.protocol, 'erpRequested', q.erp_requested,
              'resultCount', q.result_count, 'requestId', q.request_id, 'durationMs', q.duration_ms
            ) AS details
          FROM query_audit q
          LEFT JOIN users u ON u.id = q.user_id
          WHERE q.tenant_id = $1

          UNION ALL

          SELECT
            e.id, 'export'::text, e.format,
            u.name, COALESCE(u.email, 'usuário removido'), e.created_at,
            jsonb_build_object(
              'format', e.format, 'sha256', e.sha256, 'queryAuditId', e.query_audit_id,
              'publicIp', host(q.public_ip), 'searchedAt', q.searched_at,
              'port', q.port, 'protocol', q.protocol
            )
          FROM export_audit e
          JOIN query_audit q ON q.id = e.query_audit_id AND q.tenant_id = e.tenant_id
          LEFT JOIN users u ON u.id = e.user_id
          WHERE e.tenant_id = $1

          UNION ALL

          SELECT
            a.id, 'auth'::text, a.action,
            u.name, a.email, a.created_at,
            jsonb_build_object('ipAddress', host(a.ip_address), 'userAgent', a.user_agent)
          FROM auth_audit a
          LEFT JOIN users u ON u.id = a.user_id
          WHERE a.tenant_id = $1

          UNION ALL

          SELECT
            m.id, 'users'::text, m.action,
            actor.name, actor.email, m.created_at,
            m.details || jsonb_build_object('targetName', target.name, 'targetEmail', target.email)
          FROM user_management_audit m
          JOIN users actor ON actor.id = m.actor_user_id
          JOIN users target ON target.id = m.target_user_id
          WHERE m.tenant_id = $1

          UNION ALL

          SELECT
            m.id, 'devices'::text, m.action,
            actor.name, actor.email, m.created_at,
            m.details || jsonb_build_object('deviceName', d.name, 'deviceId', d.id)
          FROM device_management_audit m
          JOIN users actor ON actor.id = m.actor_user_id
          JOIN devices d ON d.id = m.device_id
          WHERE m.tenant_id = $1

          UNION ALL

          SELECT
            m.id, 'collectors'::text, m.action,
            actor.name, actor.email, m.created_at,
            m.details || jsonb_build_object('collectorName', c.name, 'collectorId', c.id)
          FROM collector_management_audit m
          JOIN users actor ON actor.id = m.actor_user_id
          JOIN collectors c ON c.id = m.collector_id
          WHERE m.tenant_id = $1

          UNION ALL

          SELECT
            f.id, 'firewall'::text, f.action,
            actor.name, COALESCE(actor.email, 'usuário removido'), f.created_at,
            f.details || jsonb_build_object('collectorName', c.name, 'collectorId', c.id)
          FROM collector_firewall_audit f
          LEFT JOIN users actor ON actor.id = f.actor_user_id
          JOIN collectors c ON c.id = f.collector_id
          WHERE f.tenant_id = $1

          UNION ALL

          SELECT
            b.id, 'backups'::text, b.action,
            actor.name, actor.email, b.created_at,
            jsonb_build_object(
              'backupId', b.backup_id, 'totalBytes', b.total_bytes,
              'ipAddress', host(b.ip_address), 'userAgent', b.user_agent
            )
          FROM system_backup_audit b
          JOIN users actor ON actor.id = b.actor_user_id
          WHERE b.tenant_id = $1
        ) timeline
        WHERE $2::text = 'all' OR category = $2::text
        ORDER BY created_at DESC
        LIMIT $3
      `, [input.tenantId, input.category, input.limit]),
      this.pool.query<{
        searches_24h: string;
        exports_24h: string;
        login_failures_24h: string;
        user_changes_24h: string;
        device_changes_24h: string;
        collector_changes_24h: string;
      }>(`
        SELECT
          (SELECT count(*) FROM query_audit WHERE tenant_id = $1 AND created_at >= now() - INTERVAL '24 hours') AS searches_24h,
          (SELECT count(*) FROM export_audit WHERE tenant_id = $1 AND created_at >= now() - INTERVAL '24 hours') AS exports_24h,
          (SELECT count(*) FROM auth_audit WHERE tenant_id = $1 AND action = 'login_failure' AND created_at >= now() - INTERVAL '24 hours') AS login_failures_24h,
          (SELECT count(*) FROM user_management_audit WHERE tenant_id = $1 AND created_at >= now() - INTERVAL '24 hours') AS user_changes_24h,
          (SELECT count(*) FROM device_management_audit WHERE tenant_id = $1 AND created_at >= now() - INTERVAL '24 hours') AS device_changes_24h,
          (SELECT count(*) FROM collector_management_audit WHERE tenant_id = $1 AND created_at >= now() - INTERVAL '24 hours') AS collector_changes_24h
      `, [input.tenantId])
    ]);
    const summary = summaryResult.rows[0];
    return {
      events: eventsResult.rows.map((row) => ({
        id: row.id,
        category: row.category,
        action: row.action,
        actorName: row.actor_name,
        actorEmail: row.actor_email,
        createdAt: new Date(row.created_at).toISOString(),
        details: row.details
      })),
      summary: {
        searches24h: Number(summary?.searches_24h ?? 0),
        exports24h: Number(summary?.exports_24h ?? 0),
        loginFailures24h: Number(summary?.login_failures_24h ?? 0),
        userChanges24h: Number(summary?.user_changes_24h ?? 0),
        deviceChanges24h: Number(summary?.device_changes_24h ?? 0),
        collectorChanges24h: Number(summary?.collector_changes_24h ?? 0)
      }
    };
  }

  async getRedundancySettings(): Promise<RedundancySettings> {
    const result = await this.pool.query<{
      mode: RedundancyMode; site_id: string; site_name: string; public_url: string;
      primary_site_id: string | null; primary_url: string; authority_epoch: string;
      configuration_revision: string; migration_status: RedundancyMigrationStatus;
      paired_at: Date | string | null; promoted_at: Date | string | null; updated_at: Date | string;
    }>(`SELECT * FROM platform_redundancy_settings WHERE singleton = true`);
    const row = result.rows[0];
    if (!row) throw new Error('Configuração de redundância ausente');
    return {
      mode: row.mode, siteId: row.site_id, siteName: row.site_name, publicUrl: row.public_url,
      primarySiteId: row.primary_site_id, primaryUrl: row.primary_url,
      authorityEpoch: Number(row.authority_epoch), configurationRevision: Number(row.configuration_revision),
      migrationStatus: row.migration_status,
      pairedAt: row.paired_at ? new Date(row.paired_at).toISOString() : null,
      promotedAt: row.promoted_at ? new Date(row.promoted_at).toISOString() : null,
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }

  async initializeRedundancyRuntime(input: {
    mode: RedundancyMode; siteId?: string; siteName: string; publicUrl: string;
    primaryUrl?: string; primarySiteId?: string;
  }): Promise<RedundancySettings> {
    if (input.mode === 'standalone') return this.getRedundancySettings();
    await this.pool.query(`
      UPDATE platform_redundancy_settings SET
        mode = $1,
        site_id = COALESCE($2::uuid, site_id),
        site_name = $3,
        public_url = $4,
        primary_url = CASE WHEN $1 = 'secondary' THEN $5 ELSE '' END,
        primary_site_id = CASE WHEN $1 = 'secondary' THEN $6::uuid ELSE NULL END,
        paired_at = CASE WHEN $1 = 'secondary' THEN COALESCE(paired_at, now()) ELSE paired_at END,
        updated_at = now()
      WHERE singleton = true AND mode = 'standalone'
    `, [input.mode, input.siteId || null, input.siteName, input.publicUrl, input.primaryUrl ?? '', input.primarySiteId || null]);
    return this.getRedundancySettings();
  }

  async configureRedundancyPrimary(input: {
    actorUserId: string; siteName: string; publicUrl: string;
  }): Promise<RedundancySettings> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const configured = await client.query(`
        UPDATE platform_redundancy_settings SET
          mode = 'primary', site_name = $2, public_url = $3,
          primary_site_id = NULL, primary_url = '', configuration_revision = configuration_revision + 1,
          updated_by_user_id = $1, updated_at = now()
        WHERE singleton = true AND mode <> 'secondary'
      `, [input.actorUserId, input.siteName, input.publicUrl]);
      if (configured.rowCount !== 1) throw new Error('redundancy_secondary_required');
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, action, details)
        VALUES ($1, 'redundancy_primary_configured', jsonb_build_object('siteName', $2::text, 'publicUrl', $3::text))
      `, [input.actorUserId, input.siteName, input.publicUrl]);
      await client.query('COMMIT');
      return this.getRedundancySettings();
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally { client.release(); }
  }

  async listRedundancySites(): Promise<RedundancySite[]> {
    const result = await this.pool.query<{
      id: string; name: string; role: 'primary' | 'secondary'; public_url: string;
      status: RedundancySite['status']; version: string; last_seen_at: Date | string | null; paired_at: Date | string;
    }>(`SELECT id, name, role, public_url, status, version, last_seen_at, paired_at FROM redundancy_sites ORDER BY paired_at`);
    return result.rows.map((row) => ({
      id: row.id, name: row.name, role: row.role, publicUrl: row.public_url, status: row.status,
      version: row.version, lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
      pairedAt: new Date(row.paired_at).toISOString()
    }));
  }

  async createRedundancyEnrollment(input: {
    actorUserId: string; tokenHash: string; expiresAt: string;
  }): Promise<{ id: string; expiresAt: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const settings = await client.query<{ mode: RedundancyMode }>(`
        SELECT mode FROM platform_redundancy_settings WHERE singleton = true FOR UPDATE
      `);
      if (settings.rows[0]?.mode !== 'primary') throw new Error('redundancy_primary_required');
      const activeSite = await client.query(`
        SELECT 1 FROM redundancy_sites WHERE role = 'secondary' AND status <> 'revoked' LIMIT 1
      `);
      if (activeSite.rowCount) throw new Error('redundancy_secondary_already_exists');
      await client.query(`UPDATE redundancy_enrollments SET status = 'revoked' WHERE status = 'pending'`);
      const result = await client.query<{ id: string; expires_at: Date | string }>(`
        INSERT INTO redundancy_enrollments (token_hash, expires_at, created_by_user_id)
        VALUES ($1, $2, $3) RETURNING id, expires_at
      `, [input.tokenHash, input.expiresAt, input.actorUserId]);
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, action, details)
        VALUES ($1, 'redundancy_enrollment_created', jsonb_build_object('expiresAt', $2::text))
      `, [input.actorUserId, input.expiresAt]);
      await client.query('COMMIT');
      const row = result.rows[0]!;
      return { id: row.id, expiresAt: new Date(row.expires_at).toISOString() };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally { client.release(); }
  }

  async consumeRedundancyEnrollment(input: {
    enrollmentTokenHash: string; siteTokenHash: string; siteName: string; publicUrl: string;
  }): Promise<{ status: 'enrolled'; siteId: string; settings: RedundancySettings } | { status: 'invalid' }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const enrollment = await client.query<{ id: string; created_by_user_id: string }>(`
        SELECT id, created_by_user_id FROM redundancy_enrollments
        WHERE token_hash = $1 AND status = 'pending' AND expires_at > now() FOR UPDATE
      `, [input.enrollmentTokenHash]);
      const pending = enrollment.rows[0];
      if (!pending) { await client.query('ROLLBACK'); return { status: 'invalid' }; }
      const activeSite = await client.query(`
        SELECT 1 FROM redundancy_sites WHERE role = 'secondary' AND status <> 'revoked' LIMIT 1
      `);
      if (activeSite.rowCount) throw new Error('redundancy_secondary_already_exists');
      const created = await client.query<{ id: string }>(`
        INSERT INTO redundancy_sites (name, role, public_url, token_hash, status)
        VALUES ($1, 'secondary', $2, $3, 'active') RETURNING id
      `, [input.siteName, input.publicUrl, input.siteTokenHash]);
      const siteId = created.rows[0]!.id;
      await client.query(`
        UPDATE redundancy_enrollments SET status = 'enrolled', enrolled_at = now(), site_id = $2 WHERE id = $1
      `, [pending.id, siteId]);
      await client.query(`
        UPDATE platform_redundancy_settings
        SET configuration_revision = configuration_revision + 1, updated_at = now()
        WHERE singleton = true
      `);
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, action, details)
        VALUES ($1, 'redundancy_site_enrolled', jsonb_build_object('siteId', $2::uuid, 'siteName', $3::text))
      `, [pending.created_by_user_id, siteId, input.siteName]);
      await client.query('COMMIT');
      return { status: 'enrolled', siteId, settings: await this.getRedundancySettings() };
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally { client.release(); }
  }

  async findRedundancySiteByTokenHash(tokenHash: string): Promise<RedundancySite | undefined> {
    const result = await this.pool.query<{
      id: string; name: string; role: 'primary' | 'secondary'; public_url: string;
      status: RedundancySite['status']; version: string; last_seen_at: Date | string | null; paired_at: Date | string;
    }>(`
      SELECT id, name, role, public_url, status, version, last_seen_at, paired_at
      FROM redundancy_sites WHERE token_hash = $1 AND status <> 'revoked' LIMIT 1
    `, [tokenHash]);
    const row = result.rows[0];
    return row ? {
      id: row.id, name: row.name, role: row.role, publicUrl: row.public_url, status: row.status,
      version: row.version, lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
      pairedAt: new Date(row.paired_at).toISOString()
    } : undefined;
  }

  async touchRedundancySite(siteId: string, version: string, serverName?: string): Promise<void> {
    await this.pool.query(`
      UPDATE redundancy_sites SET version = $2, name = COALESCE($3, name), status = 'active', last_seen_at = now(), updated_at = now()
      WHERE id = $1 AND status <> 'revoked'
    `, [siteId, version, serverName ?? null]);
  }

  async revokeRedundancySite(actorUserId: string, siteId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(`
        UPDATE redundancy_sites SET status='revoked', updated_at=now()
        WHERE id=$1 AND role='secondary' AND status <> 'revoked'
      `, [siteId]);
      if (updated.rowCount === 1) {
        await client.query(`
          INSERT INTO platform_management_audit (actor_user_id, action, details)
          VALUES ($1, 'redundancy_site_revoked', jsonb_build_object('siteId', $2::uuid))
        `, [actorUserId, siteId]);
      }
      await client.query('COMMIT');
      return updated.rowCount === 1;
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally { client.release(); }
  }

  async exportRedundancyConfiguration(): Promise<RedundancyConfigurationSnapshot> {
    const [settings, tenants, users, servicePlans, planAssignments, companyProfiles,
      collectors, devices, policies, authorizations] = await Promise.all([
      this.getRedundancySettings(),
      this.pool.query(`
        SELECT id, name, timezone, active, tenant_kind, created_at
        FROM tenants WHERE id <> '00000000-0000-0000-0000-000000000000'::uuid ORDER BY id
      `),
      this.pool.query(`
        SELECT id, tenant_id, name, email, password_hash, role, active, created_at,
          last_login_at, updated_at, deleted_at
        FROM users WHERE tenant_id <> '00000000-0000-0000-0000-000000000000'::uuid ORDER BY id
      `),
      this.pool.query(`
        SELECT id, code, name, max_devices, active, sort_order, created_at, updated_at
        FROM service_plans ORDER BY id
      `),
      this.pool.query(`
        SELECT assignment.tenant_id, plan.code AS plan_code, assignment.device_limit_override,
          assignment.assigned_at, assignment.updated_at
        FROM tenant_plan_assignments assignment
        JOIN service_plans plan ON plan.id = assignment.plan_id
        WHERE assignment.tenant_id <> '00000000-0000-0000-0000-000000000000'::uuid
        ORDER BY assignment.tenant_id
      `),
      this.pool.query(`
        SELECT tenant_id, legal_name, trade_name, cnpj, phone, email, postal_code, street,
          address_number, complement, district, city, state,
          CASE WHEN logo_data IS NULL THEN NULL ELSE encode(logo_data, 'base64') END AS logo_data,
          logo_mime, updated_at
        FROM tenant_company_profiles
        WHERE tenant_id <> '00000000-0000-0000-0000-000000000000'::uuid ORDER BY tenant_id
      `),
      this.pool.query(`
        SELECT id, tenant_id, name, mode, api_key_hash, status, version, last_seen_at,
          created_at, updated_at, deleted_at, netflow_port, syslog_port,
          secondary_netflow_port, secondary_syslog_port
        FROM collectors WHERE tenant_id <> '00000000-0000-0000-0000-000000000000'::uuid ORDER BY id
      `),
      this.pool.query(`
        SELECT id, tenant_id, collector_id, name, vendor, model, host(management_ip) AS management_ip,
          host(exporter_ip) AS exporter_ip, timezone, enabled, settings, created_at, deleted_at
        FROM devices WHERE tenant_id <> '00000000-0000-0000-0000-000000000000'::uuid ORDER BY id
      `),
      this.pool.query(`
        SELECT collector_id, tenant_id, mode, created_at, updated_at FROM collector_firewall_policies ORDER BY collector_id
      `),
      this.pool.query(`
        SELECT id, collector_id, tenant_id, source_cidr::text, description, created_at
        FROM collector_firewall_authorizations ORDER BY id
      `)
    ]);
    const iso = (value: unknown) => new Date(value as string | Date).toISOString();
    const optionalIso = (value: unknown) => value ? iso(value) : null;
    return {
      generatedAt: new Date().toISOString(), authorityEpoch: settings.authorityEpoch,
      configurationRevision: settings.configurationRevision,
      tenants: tenants.rows.map((row) => ({ id: row.id, name: row.name, timezone: row.timezone,
        active: row.active, tenantKind: row.tenant_kind, createdAt: iso(row.created_at) })),
      users: users.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, name: row.name,
        email: row.email, passwordHash: row.password_hash, role: row.role, active: row.active,
        createdAt: iso(row.created_at), lastLoginAt: optionalIso(row.last_login_at),
        updatedAt: iso(row.updated_at), deletedAt: optionalIso(row.deleted_at) })),
      servicePlans: servicePlans.rows.map((row) => ({ id: row.id, code: row.code, name: row.name,
        maxDevices: row.max_devices, active: row.active, sortOrder: row.sort_order,
        createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) })),
      tenantPlanAssignments: planAssignments.rows.map((row) => ({ tenantId: row.tenant_id,
        planCode: row.plan_code, deviceLimitOverride: row.device_limit_override,
        assignedAt: iso(row.assigned_at), updatedAt: iso(row.updated_at) })),
      companyProfiles: companyProfiles.rows.map((row) => ({ tenantId: row.tenant_id,
        legalName: row.legal_name, tradeName: row.trade_name, cnpj: row.cnpj, phone: row.phone,
        email: row.email, postalCode: row.postal_code, street: row.street,
        addressNumber: row.address_number, complement: row.complement, district: row.district,
        city: row.city, state: row.state, logoData: row.logo_data, logoMime: row.logo_mime,
        updatedAt: iso(row.updated_at) })),
      collectors: collectors.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id, name: row.name,
        mode: row.mode, apiKeyHash: row.api_key_hash, status: row.status, version: row.version,
        lastSeenAt: optionalIso(row.last_seen_at), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
        deletedAt: optionalIso(row.deleted_at), netflowPort: row.netflow_port, syslogPort: row.syslog_port,
        secondaryNetflowPort: row.secondary_netflow_port,
        secondarySyslogPort: row.secondary_syslog_port })),
      devices: devices.rows.map((row) => ({ id: row.id, tenantId: row.tenant_id,
        collectorId: row.collector_id, name: row.name, vendor: row.vendor, model: row.model,
        managementIp: row.management_ip, exporterIp: row.exporter_ip, timezone: row.timezone,
        enabled: row.enabled, settings: row.settings, createdAt: iso(row.created_at), deletedAt: optionalIso(row.deleted_at) })),
      firewallPolicies: policies.rows.map((row) => ({ collectorId: row.collector_id, tenantId: row.tenant_id,
        mode: row.mode, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) })),
      firewallAuthorizations: authorizations.rows.map((row) => ({ id: row.id, collectorId: row.collector_id,
        tenantId: row.tenant_id, sourceCidr: row.source_cidr, description: row.description,
        createdAt: iso(row.created_at) }))
    };
  }

  async applyRedundancyConfiguration(snapshot: RedundancyConfigurationSnapshot): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const local = await client.query<{ mode: RedundancyMode; authority_epoch: string }>(`
        SELECT mode, authority_epoch FROM platform_redundancy_settings WHERE singleton = true FOR UPDATE
      `);
      if (local.rows[0]?.mode !== 'secondary') throw new Error('redundancy_secondary_required');
      if (snapshot.authorityEpoch < Number(local.rows[0].authority_epoch)) throw new Error('stale_authority_epoch');
      for (const item of snapshot.tenants) await client.query(`
        INSERT INTO tenants (id, name, timezone, active, tenant_kind, created_at)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (id) DO UPDATE SET name=excluded.name, timezone=excluded.timezone,
          active=excluded.active, tenant_kind=excluded.tenant_kind, updated_at=now()
      `, [item.id, item.name, item.timezone, item.active, item.tenantKind, item.createdAt]);
      for (const item of snapshot.users) await client.query(`
        INSERT INTO users
          (id, tenant_id, name, email, password_hash, role, active, created_at, last_login_at, updated_at, deleted_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO UPDATE SET tenant_id=excluded.tenant_id, name=excluded.name,
          email=excluded.email, password_hash=excluded.password_hash, role=excluded.role,
          active=excluded.active, last_login_at=excluded.last_login_at,
          updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
      `, [item.id, item.tenantId, item.name, item.email, item.passwordHash, item.role, item.active,
        item.createdAt, item.lastLoginAt, item.updatedAt, item.deletedAt]);
      for (const item of snapshot.servicePlans) await client.query(`
        INSERT INTO service_plans (id, code, name, max_devices, active, sort_order, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (code) DO UPDATE SET name=excluded.name,
          max_devices=excluded.max_devices, active=excluded.active, sort_order=excluded.sort_order,
          updated_at=excluded.updated_at
      `, [item.id, item.code, item.name, item.maxDevices, item.active, item.sortOrder,
        item.createdAt, item.updatedAt]);
      for (const item of snapshot.tenantPlanAssignments) await client.query(`
        INSERT INTO tenant_plan_assignments
          (tenant_id, plan_id, device_limit_override, assigned_at, updated_at)
        SELECT $1, id, $3, $4, $5 FROM service_plans WHERE code = $2
        ON CONFLICT (tenant_id) DO UPDATE SET plan_id=excluded.plan_id,
          device_limit_override=excluded.device_limit_override, updated_at=excluded.updated_at
      `, [item.tenantId, item.planCode, item.deviceLimitOverride, item.assignedAt, item.updatedAt]);
      for (const item of snapshot.companyProfiles) await client.query(`
        INSERT INTO tenant_company_profiles
          (tenant_id, legal_name, trade_name, cnpj, phone, email, postal_code, street,
           address_number, complement, district, city, state, logo_data, logo_mime, updated_by_user_id, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
          CASE WHEN $14::text IS NULL THEN NULL ELSE decode($14, 'base64') END,$15,NULL,$16)
        ON CONFLICT (tenant_id) DO UPDATE SET legal_name=excluded.legal_name,
          trade_name=excluded.trade_name, cnpj=excluded.cnpj, phone=excluded.phone, email=excluded.email,
          postal_code=excluded.postal_code, street=excluded.street, address_number=excluded.address_number,
          complement=excluded.complement, district=excluded.district, city=excluded.city,
          state=excluded.state, logo_data=excluded.logo_data, logo_mime=excluded.logo_mime,
          updated_by_user_id=NULL, updated_at=excluded.updated_at
      `, [item.tenantId, item.legalName, item.tradeName, item.cnpj, item.phone, item.email,
        item.postalCode, item.street, item.addressNumber, item.complement, item.district,
        item.city, item.state, item.logoData, item.logoMime, item.updatedAt]);
      for (const item of snapshot.collectors) await client.query(`
        INSERT INTO collectors
          (id, tenant_id, name, mode, api_key_hash, status, version, last_seen_at, created_at, updated_at,
           deleted_at, netflow_port, syslog_port, secondary_netflow_port, secondary_syslog_port)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (id) DO UPDATE SET tenant_id=excluded.tenant_id, name=excluded.name, mode=excluded.mode,
          api_key_hash=excluded.api_key_hash, status=excluded.status, version=excluded.version,
          deleted_at=excluded.deleted_at, netflow_port=excluded.netflow_port, syslog_port=excluded.syslog_port,
          secondary_netflow_port=excluded.secondary_netflow_port,
          secondary_syslog_port=excluded.secondary_syslog_port,
          updated_at=excluded.updated_at
      `, [item.id, item.tenantId, item.name, item.mode, item.apiKeyHash, item.status, item.version,
        item.lastSeenAt, item.createdAt, item.updatedAt, item.deletedAt, item.netflowPort, item.syslogPort,
        item.secondaryNetflowPort, item.secondarySyslogPort]);
      for (const item of snapshot.devices) await client.query(`
        INSERT INTO devices
          (id, tenant_id, collector_id, name, vendor, model, management_ip, exporter_ip, timezone,
           enabled, settings, created_at, deleted_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7::inet,$8::inet,$9,$10,$11::jsonb,$12,$13)
        ON CONFLICT (id) DO UPDATE SET tenant_id=excluded.tenant_id, collector_id=excluded.collector_id,
          name=excluded.name, vendor=excluded.vendor, model=excluded.model, management_ip=excluded.management_ip,
          exporter_ip=excluded.exporter_ip, timezone=excluded.timezone, enabled=excluded.enabled,
          settings=excluded.settings, deleted_at=excluded.deleted_at
      `, [item.id, item.tenantId, item.collectorId, item.name, item.vendor, item.model, item.managementIp,
        item.exporterIp, item.timezone, item.enabled, JSON.stringify(item.settings), item.createdAt, item.deletedAt]);
      for (const item of snapshot.firewallPolicies) await client.query(`
        INSERT INTO collector_firewall_policies (collector_id, tenant_id, mode, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (collector_id) DO UPDATE SET tenant_id=excluded.tenant_id, mode=excluded.mode,
          updated_by_user_id=NULL, updated_at=excluded.updated_at
      `, [item.collectorId, item.tenantId, item.mode, item.createdAt, item.updatedAt]);
      const mirroredCollectorIds = snapshot.collectors.map((item) => item.id);
      if (mirroredCollectorIds.length) {
        await client.query(`
          DELETE FROM collector_firewall_authorizations WHERE collector_id = ANY($1::uuid[])
        `, [mirroredCollectorIds]);
      }
      for (const item of snapshot.firewallAuthorizations) await client.query(`
        INSERT INTO collector_firewall_authorizations
          (id, collector_id, tenant_id, source_cidr, description, created_by_user_id, created_at)
        VALUES ($1,$2,$3,$4::cidr,$5,NULL,$6)
        ON CONFLICT (id) DO UPDATE SET source_cidr=excluded.source_cidr, description=excluded.description
      `, [item.id, item.collectorId, item.tenantId, item.sourceCidr, item.description, item.createdAt]);
      await client.query(`
        UPDATE platform_redundancy_settings SET authority_epoch=$1, configuration_revision=$2, updated_at=now()
        WHERE singleton=true
      `, [snapshot.authorityEpoch, snapshot.configurationRevision]);
      await client.query('COMMIT');
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally { client.release(); }
  }

  async promoteRedundancySecondary(actorUserId: string): Promise<RedundancySettings> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(`
        UPDATE platform_redundancy_settings SET mode='primary', primary_site_id=NULL, primary_url='',
          authority_epoch=authority_epoch+1, configuration_revision=configuration_revision+1,
          promoted_at=now(), updated_by_user_id=$1, updated_at=now()
        WHERE singleton=true AND mode='secondary'
      `, [actorUserId]);
      if (updated.rowCount !== 1) throw new Error('redundancy_secondary_required');
      await client.query(`
        INSERT INTO platform_management_audit (actor_user_id, action, details)
        VALUES ($1, 'redundancy_secondary_promoted', jsonb_build_object('manual', true))
      `, [actorUserId]);
      await client.query('COMMIT');
      return this.getRedundancySettings();
    } catch (error) {
      await this.safeRollback(client);
      throw error;
    } finally { client.release(); }
  }

  async updateRedundancyMigrationStatus(
    actorUserId: string,
    status: RedundancyMigrationStatus
  ): Promise<RedundancySettings> {
    await this.pool.query(`
      WITH changed AS (
        UPDATE platform_redundancy_settings SET migration_status=$2, updated_by_user_id=$1, updated_at=now()
        WHERE singleton=true RETURNING migration_status
      )
      INSERT INTO platform_management_audit (actor_user_id, action, details)
      SELECT $1, 'redundancy_legacy_migration_updated', jsonb_build_object('status', migration_status) FROM changed
    `, [actorUserId, status]);
    return this.getRedundancySettings();
  }

  private async safeRollback(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch {
      // A conexão será descartada pelo pool caso o rollback também falhe.
    }
  }
}
