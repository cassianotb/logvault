BEGIN;

ALTER TABLE collectors
  ADD COLUMN IF NOT EXISTS secondary_netflow_port integer,
  ADD COLUMN IF NOT EXISTS secondary_syslog_port integer;

WITH used_ranges AS (
  SELECT int4range(netflow_port, syslog_port, '[]') AS ports
  FROM collectors
  WHERE mode = 'cloud' AND deleted_at IS NULL
    AND netflow_port IS NOT NULL AND syslog_port IS NOT NULL
  UNION ALL
  SELECT int4range(secondary_netflow_port, secondary_syslog_port, '[]') AS ports
  FROM collectors
  WHERE mode = 'cloud' AND deleted_at IS NULL
    AND secondary_netflow_port IS NOT NULL AND secondary_syslog_port IS NOT NULL
),
available_pairs AS (
  SELECT candidate, row_number() OVER (ORDER BY candidate) AS position
  FROM generate_series(32000, 33998, 2) candidate
  WHERE NOT EXISTS (
    SELECT 1 FROM used_ranges
    WHERE ports && int4range(candidate, candidate + 1, '[]')
  )
),
collectors_missing_secondary AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS position
  FROM collectors
  WHERE mode = 'cloud' AND deleted_at IS NULL
    AND (secondary_netflow_port IS NULL OR secondary_syslog_port IS NULL)
),
assignments AS (
  SELECT target.id, pair.candidate
  FROM collectors_missing_secondary target
  JOIN available_pairs pair USING (position)
)
UPDATE collectors collector
SET secondary_netflow_port = assignment.candidate,
    secondary_syslog_port = assignment.candidate + 1,
    updated_at = now()
FROM assignments assignment
WHERE collector.id = assignment.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM collectors
    WHERE mode = 'cloud' AND deleted_at IS NULL
      AND (secondary_netflow_port IS NULL OR secondary_syslog_port IS NULL)
  ) THEN
    RAISE EXCEPTION 'Faixa Cloud insuficiente para reservar portas do servidor redundante';
  END IF;
END $$;

ALTER TABLE collectors DROP CONSTRAINT IF EXISTS collectors_secondary_cloud_ports_check;
ALTER TABLE collectors ADD CONSTRAINT collectors_secondary_cloud_ports_check CHECK (
  (mode = 'edge' AND secondary_netflow_port IS NULL AND secondary_syslog_port IS NULL)
  OR
  (mode = 'cloud' AND deleted_at IS NOT NULL
    AND secondary_netflow_port IS NULL AND secondary_syslog_port IS NULL)
  OR
  (mode = 'cloud'
    AND secondary_netflow_port BETWEEN 1024 AND 65534
    AND secondary_syslog_port = secondary_netflow_port + 1
    AND (int4range(netflow_port, syslog_port, '[]')
      && int4range(secondary_netflow_port, secondary_syslog_port, '[]')) = false)
);

CREATE UNIQUE INDEX IF NOT EXISTS collectors_cloud_secondary_netflow_port_uidx
  ON collectors (secondary_netflow_port)
  WHERE mode = 'cloud' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS collectors_cloud_secondary_syslog_port_uidx
  ON collectors (secondary_syslog_port)
  WHERE mode = 'cloud' AND deleted_at IS NULL;

ALTER TABLE collectors DROP CONSTRAINT IF EXISTS collectors_secondary_cloud_port_overlap;
ALTER TABLE collectors ADD CONSTRAINT collectors_secondary_cloud_port_overlap
  EXCLUDE USING gist
    (int4range(secondary_netflow_port, secondary_syslog_port, '[]') WITH &&)
  WHERE (mode = 'cloud' AND deleted_at IS NULL);

COMMIT;
