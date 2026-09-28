CREATE TABLE IF NOT EXISTS tenant_company_profiles
(
    tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    legal_name text NOT NULL DEFAULT '',
    trade_name text NOT NULL DEFAULT '',
    cnpj char(14) NOT NULL DEFAULT '',
    phone text NOT NULL DEFAULT '',
    email text NOT NULL DEFAULT '',
    postal_code text NOT NULL DEFAULT '',
    street text NOT NULL DEFAULT '',
    address_number text NOT NULL DEFAULT '',
    complement text NOT NULL DEFAULT '',
    district text NOT NULL DEFAULT '',
    city text NOT NULL DEFAULT '',
    state char(2) NOT NULL DEFAULT '',
    logo_data bytea,
    logo_mime text CHECK (logo_mime IS NULL OR logo_mime IN ('image/png', 'image/jpeg')),
    updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (cnpj = '' OR cnpj ~ '^[0-9]{14}$'),
    CHECK (state = '' OR state ~ '^[A-Z]{2}$'),
    CHECK ((logo_data IS NULL AND logo_mime IS NULL) OR (logo_data IS NOT NULL AND logo_mime IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS official_report_jobs
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    requested_by_user_id uuid NOT NULL REFERENCES users(id),
    query_audit_id uuid NOT NULL REFERENCES query_audit(id),
    selected_event_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
    request_snapshot jsonb NOT NULL,
    cgnat_snapshot jsonb NOT NULL,
    company_snapshot jsonb NOT NULL,
    logo_data bytea,
    logo_mime text CHECK (logo_mime IS NULL OR logo_mime IN ('image/png', 'image/jpeg')),
    subscriber_snapshot jsonb NOT NULL DEFAULT '{"status":"erp_not_integrated"}'::jsonb,
    pdf_data bytea,
    pdf_sha256 char(64),
    error_message text NOT NULL DEFAULT '',
    requested_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    CHECK ((status = 'ready' AND pdf_data IS NOT NULL AND pdf_sha256 IS NOT NULL) OR status <> 'ready')
);

CREATE INDEX IF NOT EXISTS official_report_jobs_tenant_requested_idx
  ON official_report_jobs (tenant_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS official_report_jobs_pending_idx
  ON official_report_jobs (requested_at)
  WHERE status = 'pending';

ALTER TABLE export_audit
  DROP CONSTRAINT IF EXISTS export_audit_format_check;

ALTER TABLE export_audit
  ADD CONSTRAINT export_audit_format_check
  CHECK (format IN ('csv', 'pdf', 'official_pdf'));

ALTER TABLE platform_management_audit
  DROP CONSTRAINT IF EXISTS platform_management_audit_action_check;

ALTER TABLE platform_management_audit
  ADD CONSTRAINT platform_management_audit_action_check
  CHECK (action IN (
    'created', 'updated', 'activated', 'deactivated', 'plan_changed', 'exported',
    'plan_created', 'plan_updated', 'plan_deleted',
    'tenant_deletion_requested', 'tenant_deleted', 'tenant_deletion_failed',
    'email_settings_updated', 'email_tested', 'company_profile_updated'
  ));
