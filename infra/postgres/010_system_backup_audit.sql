CREATE TABLE IF NOT EXISTS system_backup_audit
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    actor_user_id uuid NOT NULL REFERENCES users(id),
    backup_id text NOT NULL CHECK (backup_id ~ '^[0-9]{8}T[0-9]{6}Z$'),
    action text NOT NULL CHECK (action IN ('download_started')),
    total_bytes bigint NOT NULL CHECK (total_bytes >= 0),
    ip_address inet,
    user_agent text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_backup_audit_tenant_created_idx
  ON system_backup_audit (tenant_id, created_at DESC);
