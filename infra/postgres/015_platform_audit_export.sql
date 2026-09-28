ALTER TABLE platform_management_audit
  ALTER COLUMN target_tenant_id DROP NOT NULL;

ALTER TABLE platform_management_audit
  DROP CONSTRAINT IF EXISTS platform_management_audit_action_check;

ALTER TABLE platform_management_audit
  ADD CONSTRAINT platform_management_audit_action_check
  CHECK (action IN ('created', 'updated', 'activated', 'deactivated', 'plan_changed', 'exported'));
