BEGIN;

CREATE TABLE IF NOT EXISTS infrastructure_firewall_policies (
  service text PRIMARY KEY CHECK (service IN ('web', 'ssh')),
  mode text NOT NULL DEFAULT 'open' CHECK (mode IN ('open', 'allowlist')),
  port integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
  applied_mode text CHECK (applied_mode IS NULL OR applied_mode IN ('open', 'allowlist')),
  applied_policy_updated_at timestamptz,
  applied_at timestamptz,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO infrastructure_firewall_policies (service, mode, port)
VALUES ('web', 'open', 443), ('ssh', 'open', 22)
ON CONFLICT (service) DO NOTHING;

CREATE TABLE IF NOT EXISTS infrastructure_firewall_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL REFERENCES infrastructure_firewall_policies(service) ON DELETE CASCADE,
  source_cidr cidr NOT NULL,
  description text NOT NULL DEFAULT '',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service, source_cidr)
);

CREATE INDEX IF NOT EXISTS infrastructure_firewall_authorizations_service_idx
  ON infrastructure_firewall_authorizations (service, created_at DESC);

CREATE TABLE IF NOT EXISTS infrastructure_firewall_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  service text NOT NULL CHECK (service IN ('web', 'ssh')),
  action text NOT NULL CHECK (action IN (
    'policy_open_enabled', 'policy_allowlist_enabled',
    'source_authorized', 'source_authorization_removed'
  )),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS infrastructure_firewall_audit_created_idx
  ON infrastructure_firewall_audit (created_at DESC);

COMMIT;
