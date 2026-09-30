BEGIN;

CREATE TABLE IF NOT EXISTS platform_redundancy_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  mode text NOT NULL DEFAULT 'standalone' CHECK (mode IN ('standalone', 'primary', 'secondary')),
  site_id uuid NOT NULL DEFAULT gen_random_uuid(),
  site_name text NOT NULL DEFAULT 'Servidor principal',
  public_url text NOT NULL DEFAULT '',
  primary_site_id uuid,
  primary_url text NOT NULL DEFAULT '',
  authority_epoch bigint NOT NULL DEFAULT 1 CHECK (authority_epoch > 0),
  configuration_revision bigint NOT NULL DEFAULT 1 CHECK (configuration_revision > 0),
  migration_status text NOT NULL DEFAULT 'not_started'
    CHECK (migration_status IN ('not_started', 'ready', 'migrated', 'validated')),
  paired_at timestamptz,
  promoted_at timestamptz,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_redundancy_settings (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS redundancy_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('primary', 'secondary')),
  public_url text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'offline', 'revoked')),
  version text NOT NULL DEFAULT '',
  last_seen_at timestamptz,
  paired_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS redundancy_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'enrolled', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  enrolled_at timestamptz,
  site_id uuid REFERENCES redundancy_sites(id)
);

CREATE INDEX IF NOT EXISTS redundancy_sites_status_idx ON redundancy_sites (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS redundancy_enrollments_status_idx ON redundancy_enrollments (status, expires_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS redundancy_enrollments_one_pending_idx
  ON redundancy_enrollments ((status)) WHERE status = 'pending';

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
  'backup_destination_updated', 'backup_destination_tested',
  'redundancy_primary_configured', 'redundancy_enrollment_created', 'redundancy_site_enrolled',
  'redundancy_site_revoked', 'redundancy_secondary_promoted', 'redundancy_legacy_migration_updated'
));

COMMIT;
