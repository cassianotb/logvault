CREATE TABLE IF NOT EXISTS device_discovery_sessions
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    collector_id uuid NOT NULL REFERENCES collectors(id),
    requested_by_user_id uuid NOT NULL REFERENCES users(id),
    started_at timestamptz NOT NULL DEFAULT now(),
    ends_at timestamptz NOT NULL,
    CHECK (ends_at > started_at)
);

CREATE INDEX IF NOT EXISTS device_discovery_sessions_tenant_started_idx
  ON device_discovery_sessions (tenant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS device_discovery_sessions_collector_ends_idx
  ON device_discovery_sessions (collector_id, ends_at DESC);
