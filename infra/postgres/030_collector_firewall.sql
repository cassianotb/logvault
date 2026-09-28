BEGIN;

CREATE TABLE IF NOT EXISTS collector_firewall_policies (
  collector_id uuid PRIMARY KEY REFERENCES collectors(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'monitor' CHECK (mode IN ('monitor', 'enforce')),
  applied_mode text CHECK (applied_mode IS NULL OR applied_mode IN ('monitor', 'enforce')),
  applied_policy_updated_at timestamptz,
  applied_at timestamptz,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collector_id, tenant_id)
);

INSERT INTO collector_firewall_policies (collector_id, tenant_id, mode)
SELECT id, tenant_id, 'monitor'
FROM collectors
WHERE mode = 'cloud' AND deleted_at IS NULL
ON CONFLICT (collector_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS collector_firewall_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL REFERENCES collectors(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_cidr cidr NOT NULL,
  description text NOT NULL DEFAULT '',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collector_id, source_cidr)
);

CREATE INDEX IF NOT EXISTS collector_firewall_authorizations_tenant_idx
  ON collector_firewall_authorizations (tenant_id, collector_id, created_at DESC);

CREATE TABLE IF NOT EXISTS collector_firewall_observations (
  collector_id uuid NOT NULL REFERENCES collectors(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_ip inet NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('netflow_v9', 'syslog')),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  packet_count bigint NOT NULL DEFAULT 0 CHECK (packet_count >= 0),
  blocked_packet_count bigint NOT NULL DEFAULT 0 CHECK (blocked_packet_count >= 0),
  PRIMARY KEY (collector_id, source_ip, source_type)
);

CREATE INDEX IF NOT EXISTS collector_firewall_observations_tenant_recent_idx
  ON collector_firewall_observations (tenant_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS collector_firewall_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  collector_id uuid NOT NULL REFERENCES collectors(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN (
    'policy_monitor_enabled', 'policy_enforcement_enabled',
    'source_authorized', 'source_authorization_removed'
  )),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collector_firewall_audit_tenant_created_idx
  ON collector_firewall_audit (tenant_id, created_at DESC);

COMMIT;
