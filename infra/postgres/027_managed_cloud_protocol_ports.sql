ALTER TABLE collectors
  ADD COLUMN IF NOT EXISTS netflow_port integer,
  ADD COLUMN IF NOT EXISTS syslog_port integer;

WITH active_cloud AS
(
  SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS offset
  FROM collectors
  WHERE mode = 'cloud' AND deleted_at IS NULL
)
UPDATE collectors c
SET
  netflow_port = 30000 + active_cloud.offset * 2,
  syslog_port = 30001 + active_cloud.offset * 2
FROM active_cloud
WHERE c.id = active_cloud.id;

DROP INDEX IF EXISTS collectors_cloud_ingest_port_uidx;
DROP INDEX IF EXISTS collectors_managed_cloud_registry_idx;

ALTER TABLE collectors
  DROP CONSTRAINT IF EXISTS collectors_managed_cloud_ports_check;

ALTER TABLE collectors
  ADD CONSTRAINT collectors_managed_cloud_ports_check
  CHECK (
    (mode = 'edge' AND netflow_port IS NULL AND syslog_port IS NULL)
    OR
    (mode = 'cloud' AND netflow_port BETWEEN 1024 AND 65534 AND syslog_port = netflow_port + 1)
  );

ALTER TABLE collectors
  DROP CONSTRAINT IF EXISTS collectors_managed_cloud_port_overlap;

ALTER TABLE collectors
  ADD CONSTRAINT collectors_managed_cloud_port_overlap
  EXCLUDE USING gist
    (int4range(netflow_port, syslog_port, '[]') WITH &&)
  WHERE (mode = 'cloud' AND deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS collectors_managed_cloud_registry_idx
  ON collectors (netflow_port, syslog_port, tenant_id)
  WHERE mode = 'cloud' AND status <> 'disabled' AND deleted_at IS NULL;

ALTER TABLE collectors
  DROP COLUMN IF EXISTS ingest_port;
