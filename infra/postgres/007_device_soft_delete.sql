ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE devices
  DROP CONSTRAINT IF EXISTS devices_tenant_id_exporter_ip_key;

CREATE UNIQUE INDEX IF NOT EXISTS devices_tenant_exporter_active_idx
  ON devices (tenant_id, exporter_ip)
  WHERE deleted_at IS NULL;

ALTER TABLE device_management_audit
  DROP CONSTRAINT IF EXISTS device_management_audit_action_check;

ALTER TABLE device_management_audit
  ADD CONSTRAINT device_management_audit_action_check
  CHECK (action IN ('created', 'updated', 'enabled', 'disabled', 'deleted'));
