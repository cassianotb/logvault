ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tenant_kind text NOT NULL DEFAULT 'customer';

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_tenant_kind_check;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_tenant_kind_check
  CHECK (tenant_kind IN ('platform', 'customer'));

INSERT INTO tenants (id, name, timezone, active, tenant_kind)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'LogVault Plataforma',
  'America/Sao_Paulo',
  true,
  'platform'
)
ON CONFLICT (id) DO UPDATE
SET name = 'LogVault Plataforma', tenant_kind = 'platform', active = true, updated_at = now();

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS active_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS user_sessions_active_tenant_idx
  ON user_sessions (active_tenant_id)
  WHERE active_tenant_id IS NOT NULL AND revoked_at IS NULL;

UPDATE users
SET tenant_id = '00000000-0000-0000-0000-000000000000', updated_at = now()
WHERE id IN (SELECT user_id FROM platform_administrators)
  AND tenant_id <> '00000000-0000-0000-0000-000000000000';

UPDATE user_sessions
SET tenant_id = '00000000-0000-0000-0000-000000000000',
    active_tenant_id = NULL,
    revoked_at = COALESCE(revoked_at, now())
WHERE user_id IN (SELECT user_id FROM platform_administrators)
  AND tenant_id <> '00000000-0000-0000-0000-000000000000';

DELETE FROM password_reset_tokens
WHERE user_id IN (SELECT user_id FROM platform_administrators)
  AND tenant_id <> '00000000-0000-0000-0000-000000000000';

ALTER TABLE platform_management_audit
  DROP CONSTRAINT IF EXISTS platform_management_audit_action_check;

ALTER TABLE platform_management_audit
  ADD CONSTRAINT platform_management_audit_action_check
  CHECK (action IN (
    'created', 'updated', 'activated', 'deactivated', 'plan_changed', 'exported',
    'plan_created', 'plan_updated', 'plan_deleted',
    'tenant_deletion_requested', 'tenant_deleted', 'tenant_deletion_failed',
    'email_settings_updated', 'email_tested', 'company_profile_updated',
    'tenant_accessed', 'tenant_access_ended'
  ));
