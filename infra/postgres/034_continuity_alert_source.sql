UPDATE alert_notification_settings
SET enabled_sources = array_append(enabled_sources, 'continuity'), updated_at = now()
WHERE NOT ('continuity' = ANY(enabled_sources));
