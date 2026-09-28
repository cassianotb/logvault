CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('admin', 'operator', 'auditor')),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS collectors
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    name text NOT NULL,
    mode text NOT NULL CHECK (mode IN ('edge', 'cloud')),
    api_key_hash text NOT NULL,
    status text NOT NULL DEFAULT 'provisioned',
    version text,
    last_seen_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    collector_id uuid REFERENCES collectors(id),
    name text NOT NULL,
    vendor text NOT NULL,
    model text,
    management_ip inet,
    exporter_ip inet NOT NULL,
    timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
    enabled boolean NOT NULL DEFAULT true,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, exporter_ip)
);

CREATE TABLE IF NOT EXISTS erp_integrations
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    provider text NOT NULL,
    base_url text NOT NULL,
    secret_ref text NOT NULL,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS parser_registry
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor text NOT NULL,
    source_type text NOT NULL,
    version text NOT NULL,
    status text NOT NULL CHECK (status IN ('testing', 'active', 'retired')),
    checksum text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (vendor, source_type, version)
);

CREATE TABLE IF NOT EXISTS sync_batches
(
    batch_id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    collector_id uuid NOT NULL REFERENCES collectors(id),
    checksum text NOT NULL,
    raw_count integer NOT NULL CHECK (raw_count >= 0),
    event_count integer NOT NULL CHECK (event_count >= 0),
    status text NOT NULL CHECK (status IN ('received', 'committed', 'rejected')),
    error_message text,
    received_at timestamptz NOT NULL DEFAULT now(),
    committed_at timestamptz
);

CREATE TABLE IF NOT EXISTS query_audit
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    user_id uuid REFERENCES users(id),
    public_ip inet NOT NULL,
    searched_at timestamptz NOT NULL,
    port integer CHECK (port BETWEEN 1 AND 65535),
    protocol smallint CHECK (protocol BETWEEN 0 AND 255),
    erp_requested boolean NOT NULL DEFAULT false,
    result_count integer NOT NULL DEFAULT 0,
    request_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS export_audit
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    user_id uuid REFERENCES users(id),
    query_audit_id uuid NOT NULL REFERENCES query_audit(id),
    format text NOT NULL CHECK (format IN ('csv', 'pdf')),
    sha256 text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS devices_tenant_collector_idx ON devices (tenant_id, collector_id);
CREATE INDEX IF NOT EXISTS collectors_tenant_status_idx ON collectors (tenant_id, status);
CREATE INDEX IF NOT EXISTS query_audit_tenant_created_idx ON query_audit (tenant_id, created_at DESC);
