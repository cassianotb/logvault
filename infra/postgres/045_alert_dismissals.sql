BEGIN;

CREATE TABLE IF NOT EXISTS alert_dismissals (
  tenant_id uuid NOT NULL,
  alert_id text NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  PRIMARY KEY (tenant_id, alert_id)
);

CREATE INDEX IF NOT EXISTS alert_dismissals_active_idx
  ON alert_dismissals (tenant_id, active, dismissed_at DESC);

COMMIT;
