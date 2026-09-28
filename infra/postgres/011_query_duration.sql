ALTER TABLE query_audit
  ADD COLUMN IF NOT EXISTS duration_ms integer;

ALTER TABLE query_audit
  DROP CONSTRAINT IF EXISTS query_audit_duration_ms_check;

ALTER TABLE query_audit
  ADD CONSTRAINT query_audit_duration_ms_check
  CHECK (duration_ms IS NULL OR duration_ms >= 0);

CREATE INDEX IF NOT EXISTS query_audit_tenant_duration_created_idx
  ON query_audit (tenant_id, created_at DESC)
  WHERE duration_ms IS NOT NULL;
