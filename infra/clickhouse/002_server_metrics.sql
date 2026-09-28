CREATE TABLE IF NOT EXISTS argus.server_metrics
(
    tenant_id UUID,
    server_id String,
    sampled_at DateTime64(3, 'UTC'),
    cpu_usage_percent Nullable(Float32),
    memory_total_bytes UInt64,
    memory_used_bytes UInt64,
    storage_total_bytes Nullable(UInt64),
    storage_used_bytes Nullable(UInt64),
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMMDD(sampled_at)
ORDER BY (tenant_id, server_id, sampled_at)
TTL sampled_at + INTERVAL 2 DAY DELETE
SETTINGS index_granularity = 8192;
