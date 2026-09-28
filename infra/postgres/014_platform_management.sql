ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS users_active_global_lower_email_idx
  ON users (lower(email))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS platform_administrators
(
    user_id uuid PRIMARY KEY REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_management_audit
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid NOT NULL REFERENCES users(id),
    target_tenant_id uuid NOT NULL REFERENCES tenants(id),
    action text NOT NULL CHECK (action IN ('created', 'updated', 'activated', 'deactivated', 'plan_changed')),
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_management_audit_created_idx
  ON platform_management_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS platform_management_audit_tenant_created_idx
  ON platform_management_audit (target_tenant_id, created_at DESC);
