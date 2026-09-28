CREATE UNIQUE INDEX IF NOT EXISTS service_plans_active_lower_name_idx
  ON service_plans (lower(name))
  WHERE active = true;

CREATE TABLE IF NOT EXISTS tenant_deletion_jobs
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid,
    tenant_fingerprint char(64) NOT NULL,
    tenant_name text NOT NULL,
    requested_by_user_id uuid NOT NULL REFERENCES users(id),
    status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    raw_rows_deleted bigint NOT NULL DEFAULT 0 CHECK (raw_rows_deleted >= 0),
    event_rows_deleted bigint NOT NULL DEFAULT 0 CHECK (event_rows_deleted >= 0),
    error_message text NOT NULL DEFAULT '',
    requested_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_deletion_jobs_active_tenant_idx
  ON tenant_deletion_jobs (tenant_id)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS tenant_deletion_jobs_requested_idx
  ON tenant_deletion_jobs (requested_at DESC);

ALTER TABLE platform_management_audit
  DROP CONSTRAINT IF EXISTS platform_management_audit_action_check;

ALTER TABLE platform_management_audit
  ADD CONSTRAINT platform_management_audit_action_check
  CHECK (action IN (
    'created', 'updated', 'activated', 'deactivated', 'plan_changed', 'exported',
    'plan_created', 'plan_updated', 'plan_deleted',
    'tenant_deletion_requested', 'tenant_deleted', 'tenant_deletion_failed'
  ));
