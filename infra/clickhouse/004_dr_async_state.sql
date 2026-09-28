CREATE TABLE IF NOT EXISTS argus.dr_mirror_state
(
    table_name LowCardinality(String),
    watermark_ms UInt64,
    source_max_ms UInt64,
    last_success_at DateTime64(3, 'UTC'),
    last_error String CODEC(ZSTD(3)),
    version DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(version)
ORDER BY table_name
TTL last_success_at + INTERVAL 30 DAY DELETE
SETTINGS index_granularity = 8192;
