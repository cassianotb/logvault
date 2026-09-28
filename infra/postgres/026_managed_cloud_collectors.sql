ALTER TABLE collectors
  ADD COLUMN IF NOT EXISTS ingest_port integer;

WITH available_cloud AS
(
  SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS offset
  FROM collectors
  WHERE mode = 'cloud' AND deleted_at IS NULL
)
UPDATE collectors c
SET ingest_port = 30000 + available_cloud.offset
FROM available_cloud
WHERE c.id = available_cloud.id AND c.ingest_port IS NULL;

ALTER TABLE collectors
  DROP CONSTRAINT IF EXISTS collectors_ingest_port_range_check;

ALTER TABLE collectors
  ADD CONSTRAINT collectors_ingest_port_range_check
  CHECK (ingest_port IS NULL OR ingest_port BETWEEN 1024 AND 65535);

CREATE UNIQUE INDEX IF NOT EXISTS collectors_one_cloud_per_tenant_uidx
  ON collectors (tenant_id)
  WHERE mode = 'cloud' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS collectors_cloud_ingest_port_uidx
  ON collectors (ingest_port)
  WHERE mode = 'cloud' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS collectors_managed_cloud_registry_idx
  ON collectors (ingest_port, tenant_id)
  WHERE mode = 'cloud' AND status <> 'disabled' AND deleted_at IS NULL;
