ALTER TABLE collectors
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE collector_management_audit
  DROP CONSTRAINT IF EXISTS collector_management_audit_action_check;

ALTER TABLE collector_management_audit
  ADD CONSTRAINT collector_management_audit_action_check
  CHECK (action IN ('created', 'updated', 'activated', 'deactivated', 'credential_rotated', 'deleted'));

CREATE INDEX IF NOT EXISTS collectors_tenant_active_idx
  ON collectors (tenant_id, name)
  WHERE deleted_at IS NULL;
