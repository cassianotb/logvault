ALTER TABLE argus.server_metrics
  ADD COLUMN IF NOT EXISTS network_received_bytes_per_second Nullable(Float64) AFTER storage_used_bytes;

ALTER TABLE argus.server_metrics
  ADD COLUMN IF NOT EXISTS network_transmitted_bytes_per_second Nullable(Float64) AFTER network_received_bytes_per_second;
