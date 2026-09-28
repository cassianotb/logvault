CREATE TABLE IF NOT EXISTS platform_email_settings
(
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
    enabled boolean NOT NULL DEFAULT false,
    smtp_host text NOT NULL DEFAULT '',
    smtp_port integer NOT NULL DEFAULT 587 CHECK (smtp_port BETWEEN 1 AND 65535),
    smtp_secure boolean NOT NULL DEFAULT false,
    smtp_user text NOT NULL DEFAULT '',
    smtp_password_secret text NOT NULL DEFAULT '',
    smtp_from text NOT NULL DEFAULT '',
    last_test_at timestamptz,
    last_test_status text CHECK (last_test_status IN ('success', 'failed')),
    last_test_error text NOT NULL DEFAULT '',
    updated_by_user_id uuid REFERENCES users(id),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_management_audit
  DROP CONSTRAINT IF EXISTS platform_management_audit_action_check;

ALTER TABLE platform_management_audit
  ADD CONSTRAINT platform_management_audit_action_check
  CHECK (action IN (
    'created', 'updated', 'activated', 'deactivated', 'plan_changed', 'exported',
    'plan_created', 'plan_updated', 'plan_deleted',
    'tenant_deletion_requested', 'tenant_deleted', 'tenant_deletion_failed',
    'email_settings_updated', 'email_tested'
  ));
