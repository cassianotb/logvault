CREATE TABLE IF NOT EXISTS alert_notification_settings
(
    tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    enabled boolean NOT NULL DEFAULT false,
    webhook_url text NOT NULL DEFAULT '',
    minimum_severity text NOT NULL DEFAULT 'critical' CHECK (minimum_severity IN ('warning', 'critical')),
    enabled_sources text[] NOT NULL DEFAULT ARRAY['backup', 'collector', 'device', 'parser', 'spool', 'server']::text[],
    reminder_minutes integer NOT NULL DEFAULT 60 CHECK (reminder_minutes BETWEEN 15 AND 10080),
    recovery_enabled boolean NOT NULL DEFAULT true,
    last_test_at timestamptz,
    last_test_status text CHECK (last_test_status IS NULL OR last_test_status IN ('success', 'failed')),
    last_test_error text NOT NULL DEFAULT '',
    updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_delivery_state
(
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    alert_id text NOT NULL,
    source text NOT NULL,
    severity text NOT NULL CHECK (severity IN ('warning', 'critical')),
    title text NOT NULL,
    detail text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    first_seen_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL,
    last_notified_at timestamptz,
    resolved_at timestamptz,
    PRIMARY KEY (tenant_id, alert_id)
);

CREATE INDEX IF NOT EXISTS alert_delivery_state_active_idx
  ON alert_delivery_state (tenant_id, active, last_notified_at);
