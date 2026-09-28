CREATE DATABASE IF NOT EXISTS argus;

CREATE TABLE IF NOT EXISTS argus.ingest_raw
(
    raw_id UUID,
    batch_id UUID,
    tenant_id UUID,
    collector_id UUID,
    device_id UUID,
    vendor LowCardinality(String),
    source_type LowCardinality(String),
    exporter_ip String,
    exporter_port UInt16,
    local_sequence UInt64,
    received_at DateTime64(3, 'UTC'),
    exporter_time Nullable(DateTime64(3, 'UTC')),
    observation_domain_id Nullable(UInt32),
    export_sequence Nullable(UInt32),
    template_id Nullable(UInt16),
    payload_format LowCardinality(String),
    raw_payload String CODEC(ZSTD(3)),
    raw_sha256 FixedString(64),
    decoded_json String CODEC(ZSTD(3)),
    parse_status LowCardinality(String),
    parser_version LowCardinality(String),
    parse_error String CODEC(ZSTD(3)),
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplicatedReplacingMergeTree('/argus/tables/{shard}/ingest_raw', '{replica}', ingested_at)
PARTITION BY toYYYYMM(received_at)
ORDER BY (tenant_id, device_id, received_at, raw_id)
TTL received_at + INTERVAL 13 MONTH DELETE
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS argus.cgnat_events
(
    event_id UUID,
    raw_id UUID,
    batch_id UUID,
    record_index UInt16,
    tenant_id UUID,
    collector_id UUID,
    device_id UUID,
    vendor LowCardinality(String),
    source_type LowCardinality(String),
    event_at DateTime64(3, 'UTC'),
    received_at DateTime64(3, 'UTC'),
    public_ip IPv4,
    private_ip IPv4,
    protocol UInt8,
    protocol_name LowCardinality(String),
    port_start UInt16,
    port_end UInt16,
    port_mode LowCardinality(String),
    port_step Nullable(UInt16),
    port_count Nullable(UInt32),
    event_type LowCardinality(String),
    event_type_raw String,
    vendor_fields Map(String, String) CODEC(ZSTD(3)),
    parser_version LowCardinality(String),
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplicatedReplacingMergeTree('/argus/tables/{shard}/cgnat_events', '{replica}', ingested_at)
PARTITION BY toYYYYMM(received_at)
ORDER BY (tenant_id, public_ip, event_at, protocol, port_start, event_id)
TTL received_at + INTERVAL 13 MONTH DELETE
SETTINGS index_granularity = 8192;

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
    network_received_bytes_per_second Nullable(Float64),
    network_transmitted_bytes_per_second Nullable(Float64),
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplicatedMergeTree('/argus/tables/{shard}/server_metrics', '{replica}')
PARTITION BY toYYYYMMDD(sampled_at)
ORDER BY (tenant_id, server_id, sampled_at)
TTL sampled_at + INTERVAL 2 DAY DELETE
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS argus.dr_replication_probe
(
    probe_id String,
    source LowCardinality(String),
    inserted_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplicatedMergeTree('/argus/tables/{shard}/dr_replication_probe', '{replica}')
ORDER BY (probe_id, inserted_at);
