CREATE INDEX IF NOT EXISTS export_audit_tenant_created_idx
  ON export_audit (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_audit_tenant_created_idx
  ON auth_audit (tenant_id, created_at DESC);
