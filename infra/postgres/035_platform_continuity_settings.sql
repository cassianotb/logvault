CREATE TABLE IF NOT EXISTS platform_continuity_settings
(
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
    enabled boolean NOT NULL DEFAULT false,
    site_a_name text NOT NULL DEFAULT 'Data Center A',
    site_b_name text NOT NULL DEFAULT 'Data Center B',
    postgres_standby_url_secret text NOT NULL DEFAULT '',
    clickhouse_standby_url text NOT NULL DEFAULT '',
    clickhouse_standby_user text NOT NULL DEFAULT 'argus_monitor',
    clickhouse_standby_password_secret text NOT NULL DEFAULT '',
    standby_api_url text NOT NULL DEFAULT '',
    warning_seconds integer NOT NULL DEFAULT 10 CHECK (warning_seconds BETWEEN 1 AND 86400),
    critical_seconds integer NOT NULL DEFAULT 60 CHECK (critical_seconds BETWEEN 2 AND 86400 AND critical_seconds > warning_seconds),
    last_test_at timestamptz,
    last_test_status text CHECK (last_test_status IS NULL OR last_test_status IN ('success', 'failed')),
    last_test_error text NOT NULL DEFAULT '',
    updated_by_user_id uuid REFERENCES users(id),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_management_audit DROP CONSTRAINT IF EXISTS platform_management_audit_action_check;
ALTER TABLE platform_management_audit ADD CONSTRAINT platform_management_audit_action_check CHECK (action IN (
  'created', 'updated', 'activated', 'deactivated', 'plan_changed', 'exported',
  'plan_created', 'plan_updated', 'plan_deleted',
  'tenant_deletion_requested', 'tenant_deleted', 'tenant_deletion_failed',
  'email_settings_updated', 'email_tested', 'company_profile_updated',
  'tenant_accessed', 'tenant_access_ended',
  'access_profile_created', 'access_profile_updated', 'access_profile_deleted',
  'integration_provider_enabled', 'integration_provider_disabled',
  'continuity_settings_updated', 'continuity_tested'
));
