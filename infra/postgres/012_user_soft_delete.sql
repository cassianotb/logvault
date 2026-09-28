ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_tenant_id_email_key;

DROP INDEX IF EXISTS users_tenant_lower_email_idx;

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_active_lower_email_idx
  ON users (tenant_id, lower(email))
  WHERE deleted_at IS NULL;

ALTER TABLE user_management_audit
  DROP CONSTRAINT IF EXISTS user_management_audit_action_check;

ALTER TABLE user_management_audit
  ADD CONSTRAINT user_management_audit_action_check
  CHECK (action IN ('created', 'updated', 'activated', 'deactivated', 'deleted'));

CREATE INDEX IF NOT EXISTS users_tenant_not_deleted_idx
  ON users (tenant_id, active, name)
  WHERE deleted_at IS NULL;
