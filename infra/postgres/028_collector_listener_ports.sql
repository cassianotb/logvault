ALTER TABLE collector_telemetry
  ADD COLUMN IF NOT EXISTS netflow_port integer,
  ADD COLUMN IF NOT EXISTS syslog_port integer;

ALTER TABLE collector_telemetry
  DROP CONSTRAINT IF EXISTS collector_telemetry_listener_ports_check;

ALTER TABLE collector_telemetry
  ADD CONSTRAINT collector_telemetry_listener_ports_check
  CHECK (
    (netflow_port IS NULL OR netflow_port BETWEEN 1 AND 65535)
    AND (syslog_port IS NULL OR syslog_port BETWEEN 1 AND 65535)
  );
