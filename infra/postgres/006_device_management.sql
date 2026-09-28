CREATE TABLE IF NOT EXISTS device_management_audit
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    actor_user_id uuid NOT NULL REFERENCES users(id),
    device_id uuid NOT NULL REFERENCES devices(id),
    action text NOT NULL CHECK (action IN ('created', 'updated', 'enabled', 'disabled')),
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_management_audit_tenant_created_idx
  ON device_management_audit (tenant_id, created_at DESC);
