ALTER TABLE alert_notification_settings
  ADD COLUMN IF NOT EXISTS destination_type text NOT NULL DEFAULT 'generic'
    CHECK (destination_type IN ('generic', 'discord', 'telegram')),
  ADD COLUMN IF NOT EXISTS destination_secret text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS telegram_chat_id text NOT NULL DEFAULT '';
