BEGIN;

CREATE TABLE IF NOT EXISTS platform_backup_destinations
(
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
    enabled boolean NOT NULL DEFAULT false,
    provider text NOT NULL DEFAULT 'google_drive' CHECK (provider = 'google_drive'),
    folder_id text NOT NULL DEFAULT '',
    service_account_secret text NOT NULL DEFAULT '',
    encryption_passphrase_secret text NOT NULL DEFAULT '',
    retention_days integer NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 3650),
    last_test_at timestamptz,
    last_test_status text CHECK (last_test_status IS NULL OR last_test_status IN ('success', 'failed')),
    last_test_error text NOT NULL DEFAULT '',
    updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_backup_jobs
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    requested_by_user_id uuid NOT NULL REFERENCES users(id),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
    send_to_google_drive boolean NOT NULL DEFAULT false,
    archive_name text,
    byte_count bigint NOT NULL DEFAULT 0 CHECK (byte_count >= 0),
    sha256 char(64),
    google_drive_file_id text,
    error_message text NOT NULL DEFAULT '',
    requested_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS tenant_backup_jobs_tenant_requested_idx
  ON tenant_backup_jobs (tenant_id, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_backup_jobs_one_active_idx
  ON tenant_backup_jobs (tenant_id) WHERE status IN ('pending', 'processing');

CREATE TABLE IF NOT EXISTS external_backup_uploads
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope text NOT NULL CHECK (scope IN ('platform', 'tenant')),
    source_backup_id text NOT NULL,
    tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
    provider text NOT NULL DEFAULT 'google_drive' CHECK (provider = 'google_drive'),
    status text NOT NULL CHECK (status IN ('uploading', 'success', 'failed')),
    byte_count bigint NOT NULL DEFAULT 0 CHECK (byte_count >= 0),
    sha256 char(64),
    remote_file_id text,
    error_message text NOT NULL DEFAULT '',
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    UNIQUE (scope, source_backup_id, provider)
);

CREATE INDEX IF NOT EXISTS external_backup_uploads_recent_idx
  ON external_backup_uploads (started_at DESC);

ALTER TABLE system_backup_audit DROP CONSTRAINT IF EXISTS system_backup_audit_backup_id_check;
ALTER TABLE system_backup_audit DROP CONSTRAINT IF EXISTS system_backup_audit_action_check;
ALTER TABLE system_backup_audit ADD CONSTRAINT system_backup_audit_action_check
  CHECK (action IN ('download_started', 'tenant_backup_requested', 'tenant_backup_downloaded'));

ALTER TABLE platform_management_audit DROP CONSTRAINT IF EXISTS platform_management_audit_action_check;
ALTER TABLE platform_management_audit ADD CONSTRAINT platform_management_audit_action_check CHECK (action IN (
  'created', 'updated', 'activated', 'deactivated', 'plan_changed', 'exported',
  'plan_created', 'plan_updated', 'plan_deleted',
  'tenant_deletion_requested', 'tenant_deleted', 'tenant_deletion_failed',
  'email_settings_updated', 'email_tested', 'company_profile_updated',
  'tenant_accessed', 'tenant_access_ended',
  'access_profile_created', 'access_profile_updated', 'access_profile_deleted',
  'integration_provider_enabled', 'integration_provider_disabled',
  'continuity_settings_updated', 'continuity_tested',
  'continuity_enrollment_created', 'continuity_enrolled', 'continuity_enrollment_revoked',
  'backup_destination_updated', 'backup_destination_tested'
));

COMMIT;
