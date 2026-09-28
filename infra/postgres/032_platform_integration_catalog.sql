CREATE TABLE IF NOT EXISTS platform_integration_providers
(
    provider text PRIMARY KEY,
    enabled boolean NOT NULL DEFAULT false,
    updated_by_user_id uuid REFERENCES users(id),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_integration_providers (provider, enabled)
VALUES ('elleven', true)
ON CONFLICT (provider) DO NOTHING;

UPDATE platform_access_profiles
SET permissions = permissions || '{"integrations":"manage"}'::jsonb,
    updated_at = now()
WHERE protected = true
  AND NOT (permissions ? 'integrations');

ALTER TABLE platform_management_audit
  DROP CONSTRAINT IF EXISTS platform_management_audit_action_check;

ALTER TABLE platform_management_audit
  ADD CONSTRAINT platform_management_audit_action_check
  CHECK (action IN (
    'created', 'updated', 'activated', 'deactivated', 'plan_changed', 'exported',
    'plan_created', 'plan_updated', 'plan_deleted',
    'tenant_deletion_requested', 'tenant_deleted', 'tenant_deletion_failed',
    'email_settings_updated', 'email_tested', 'company_profile_updated',
    'tenant_accessed', 'tenant_access_ended',
    'access_profile_created', 'access_profile_updated', 'access_profile_deleted',
    'integration_provider_enabled', 'integration_provider_disabled'
  ));
