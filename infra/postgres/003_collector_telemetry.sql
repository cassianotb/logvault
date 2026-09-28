CREATE TABLE IF NOT EXISTS collector_telemetry
(
    collector_id uuid PRIMARY KEY REFERENCES collectors(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    version text NOT NULL,
    sent_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    pending_records bigint NOT NULL CHECK (pending_records >= 0),
    pending_events bigint NOT NULL CHECK (pending_events >= 0),
    pending_batches bigint NOT NULL CHECK (pending_batches >= 0),
    acknowledged_records_retained bigint NOT NULL CHECK (acknowledged_records_retained >= 0),
    oldest_pending_at timestamptz,
    spool_bytes bigint NOT NULL CHECK (spool_bytes >= 0),
    last_sync_at timestamptz,
    last_sync_error text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS collector_telemetry_tenant_received_idx
  ON collector_telemetry (tenant_id, received_at DESC);
