CREATE TABLE IF NOT EXISTS service_plans
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    max_devices integer CHECK (max_devices IS NULL OR max_devices > 0),
    active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_plan_assignments
(
    tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
    plan_id uuid NOT NULL REFERENCES service_plans(id),
    device_limit_override integer CHECK (device_limit_override IS NULL OR device_limit_override > 0),
    assigned_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO service_plans (code, name, max_devices, sort_order)
VALUES
  ('device_1', '1 equipamento', 1, 10),
  ('device_3', 'Até 3 equipamentos', 3, 20),
  ('device_5', 'Até 5 equipamentos', 5, 30),
  ('custom', 'Personalizado', NULL, 40)
ON CONFLICT (code) DO NOTHING;

INSERT INTO tenant_plan_assignments (tenant_id, plan_id)
SELECT t.id, sp.id
FROM tenants t
CROSS JOIN service_plans sp
WHERE sp.code = 'custom'
ON CONFLICT (tenant_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS tenant_plan_assignments_plan_idx
  ON tenant_plan_assignments (plan_id);
