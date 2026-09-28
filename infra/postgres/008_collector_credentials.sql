ALTER TABLE collectors
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS collectors_api_key_hash_uidx
  ON collectors (api_key_hash)
  WHERE api_key_hash <> 'homolog-only';

CREATE TABLE IF NOT EXISTS collector_management_audit
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    actor_user_id uuid NOT NULL REFERENCES users(id),
    collector_id uuid NOT NULL REFERENCES collectors(id),
    action text NOT NULL CHECK (action IN ('created', 'updated', 'activated', 'deactivated', 'credential_rotated')),
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collector_management_audit_tenant_created_idx
  ON collector_management_audit (tenant_id, created_at DESC);
