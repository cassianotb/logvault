CREATE TABLE IF NOT EXISTS platform_access_profiles
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    permissions jsonb NOT NULL,
    protected boolean NOT NULL DEFAULT false,
    created_by_user_id uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CHECK (jsonb_typeof(permissions) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_access_profiles_active_name_idx
  ON platform_access_profiles (lower(name))
  WHERE deleted_at IS NULL;

INSERT INTO platform_access_profiles (id, name, description, permissions, protected)
VALUES (
  '00000000-0000-4000-8000-000000000101',
  'Acesso total',
  'Gerenciamento completo de todos os módulos da plataforma.',
  '{
    "dashboard":"manage", "devices":"manage", "collectors":"manage",
    "system":"manage", "servers":"manage", "firewall":"manage",
    "alerts":"manage", "capacity":"manage", "clients":"manage",
    "plans":"manage", "users":"manage", "settings":"manage", "audit":"manage"
  }'::jsonb,
  true
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE platform_administrators
  ADD COLUMN IF NOT EXISTS access_profile_id uuid REFERENCES platform_access_profiles(id),
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

WITH first_owner AS (
  SELECT pa.user_id
  FROM platform_administrators pa
  JOIN users u ON u.id = pa.user_id
  ORDER BY pa.created_at, u.created_at, pa.user_id
  LIMIT 1
)
UPDATE platform_administrators pa
SET is_owner = true, access_profile_id = NULL
FROM first_owner
WHERE pa.user_id = first_owner.user_id
  AND NOT EXISTS (SELECT 1 FROM platform_administrators WHERE is_owner = true);

UPDATE platform_administrators
SET access_profile_id = '00000000-0000-4000-8000-000000000101'
WHERE is_owner = false AND access_profile_id IS NULL;

CREATE INDEX IF NOT EXISTS platform_administrators_profile_idx
  ON platform_administrators (access_profile_id)
  WHERE access_profile_id IS NOT NULL;

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
    'access_profile_created', 'access_profile_updated', 'access_profile_deleted'
  ));
