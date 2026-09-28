CREATE TABLE IF NOT EXISTS official_report_deletion_audit
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    report_id uuid NOT NULL,
    query_audit_id uuid,
    pdf_sha256 char(64) NOT NULL,
    deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS official_report_deletion_audit_tenant_deleted_idx
  ON official_report_deletion_audit (tenant_id, deleted_at DESC);
