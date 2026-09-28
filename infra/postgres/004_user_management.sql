ALTER TABLE users
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_lower_email_idx
  ON users (tenant_id, lower(email));

ALTER TABLE auth_audit DROP CONSTRAINT IF EXISTS auth_audit_action_check;
ALTER TABLE auth_audit
  ADD CONSTRAINT auth_audit_action_check
  CHECK (action IN ('login_success', 'login_failure', 'logout', 'password_change'));

CREATE TABLE IF NOT EXISTS user_management_audit
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    actor_user_id uuid NOT NULL REFERENCES users(id),
    target_user_id uuid NOT NULL REFERENCES users(id),
    action text NOT NULL CHECK (action IN ('created', 'updated', 'activated', 'deactivated')),
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_management_audit_tenant_created_idx
  ON user_management_audit (tenant_id, created_at DESC);
