CREATE TABLE IF NOT EXISTS continuity_enrollments
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash text UNIQUE,
    status text NOT NULL CHECK (status IN ('pending', 'enrolled', 'revoked')),
    expires_at timestamptz NOT NULL,
    inventory jsonb,
    created_by_user_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    enrolled_at timestamptz
);

CREATE INDEX IF NOT EXISTS continuity_enrollments_created_idx ON continuity_enrollments (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS continuity_enrollments_one_pending_idx ON continuity_enrollments ((status)) WHERE status = 'pending';

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
  'continuity_enrollment_created', 'continuity_enrolled', 'continuity_enrollment_revoked'
));
