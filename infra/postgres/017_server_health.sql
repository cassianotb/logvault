ALTER TABLE collector_telemetry
  ADD COLUMN IF NOT EXISTS host_name text,
  ADD COLUMN IF NOT EXISTS host_platform text,
  ADD COLUMN IF NOT EXISTS host_uptime_seconds bigint CHECK (host_uptime_seconds IS NULL OR host_uptime_seconds >= 0),
  ADD COLUMN IF NOT EXISTS cpu_usage_percent double precision CHECK (cpu_usage_percent IS NULL OR cpu_usage_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS memory_total_bytes bigint CHECK (memory_total_bytes IS NULL OR memory_total_bytes >= 0),
  ADD COLUMN IF NOT EXISTS memory_used_bytes bigint CHECK (memory_used_bytes IS NULL OR memory_used_bytes >= 0),
  ADD COLUMN IF NOT EXISTS disk_total_bytes bigint CHECK (disk_total_bytes IS NULL OR disk_total_bytes >= 0),
  ADD COLUMN IF NOT EXISTS disk_used_bytes bigint CHECK (disk_used_bytes IS NULL OR disk_used_bytes >= 0);
