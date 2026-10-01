CREATE TABLE IF NOT EXISTS argus.ingest_batch_receipts
(
    batch_id UUID,
    tenant_id UUID,
    collector_id UUID,
    checksum FixedString(64),
    raw_count UInt32,
    event_count UInt32,
    committed_at DateTime64(3, 'UTC') DEFAULT now64(3),
    version UInt64 DEFAULT toUnixTimestamp64Milli(now64(3))
)
ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(committed_at)
ORDER BY batch_id
TTL committed_at + INTERVAL 14 MONTH DELETE
SETTINGS index_granularity = 1024;

ALTER TABLE argus.ingest_raw
    ADD INDEX IF NOT EXISTS ingest_raw_batch_id_bloom batch_id TYPE bloom_filter(0.01) GRANULARITY 1;

ALTER TABLE argus.cgnat_events
    ADD INDEX IF NOT EXISTS cgnat_events_batch_id_bloom batch_id TYPE bloom_filter(0.01) GRANULARITY 1;
