BEGIN;

ALTER TABLE alert_notification_settings
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

UPDATE alert_notification_settings
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE alert_notification_settings
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE alert_notification_settings
  DROP CONSTRAINT IF EXISTS alert_notification_settings_pkey;

ALTER TABLE alert_notification_settings
  ADD CONSTRAINT alert_notification_settings_pkey PRIMARY KEY (id);

ALTER TABLE alert_notification_settings
  DROP CONSTRAINT IF EXISTS alert_notification_settings_tenant_destination_key;

ALTER TABLE alert_notification_settings
  ADD CONSTRAINT alert_notification_settings_tenant_destination_key UNIQUE (tenant_id, destination_type);

ALTER TABLE alert_delivery_state
  ADD COLUMN IF NOT EXISTS notification_setting_id uuid;

UPDATE alert_delivery_state state
SET notification_setting_id = settings.id
FROM alert_notification_settings settings
WHERE state.tenant_id = settings.tenant_id
  AND state.notification_setting_id IS NULL;

DELETE FROM alert_delivery_state
WHERE notification_setting_id IS NULL;

ALTER TABLE alert_delivery_state
  ALTER COLUMN notification_setting_id SET NOT NULL;

ALTER TABLE alert_delivery_state
  DROP CONSTRAINT IF EXISTS alert_delivery_state_notification_setting_id_fkey;

ALTER TABLE alert_delivery_state
  ADD CONSTRAINT alert_delivery_state_notification_setting_id_fkey
    FOREIGN KEY (notification_setting_id) REFERENCES alert_notification_settings(id) ON DELETE CASCADE;

ALTER TABLE alert_delivery_state
  DROP CONSTRAINT IF EXISTS alert_delivery_state_pkey;

ALTER TABLE alert_delivery_state
  ADD CONSTRAINT alert_delivery_state_pkey PRIMARY KEY (tenant_id, notification_setting_id, alert_id);

DROP INDEX IF EXISTS alert_delivery_state_active_idx;
CREATE INDEX alert_delivery_state_active_idx
  ON alert_delivery_state (tenant_id, notification_setting_id, active, last_notified_at);

COMMIT;
