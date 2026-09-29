import { createClient, type ClickHouseClient } from '@clickhouse/client';
import type { CgnatEvent, IngestBatch, RawRecord } from '../domain/models.js';
import type { HostMetrics } from '../core/host-metrics.js';

export const CLOUD_METRICS_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export type ServerHistoryPeriod = '5m' | '30m' | '1h' | '24h';

export interface ServerMetricHistoryPoint {
  sampledAt: string;
  cpuUsagePercent: number | null;
  memoryUsagePercent: number | null;
  storageUsagePercent: number | null;
  networkReceivedBytesPerSecond: number | null;
  networkTransmittedBytesPerSecond: number | null;
}

export interface ServerMetricSample {
  tenantId: string;
  serverId: string;
  sampledAt: string;
  metrics: HostMetrics;
}

const serverHistoryWindows: Record<ServerHistoryPeriod, { seconds: number; bucketSeconds: number }> = {
  '5m': { seconds: 5 * 60, bucketSeconds: 10 },
  '30m': { seconds: 30 * 60, bucketSeconds: 30 },
  '1h': { seconds: 60 * 60, bucketSeconds: 60 },
  '24h': { seconds: 24 * 60 * 60, bucketSeconds: 10 * 60 }
};

export interface CgnatSearchInput {
  tenantId: string;
  publicIp: string;
  at: string;
  port: number | null;
  protocol: number | null;
}

export interface CgnatSearchRow {
  deviceId: string;
  lastEventId: string;
  publicIp: string;
  privateIp: string;
  protocol: number;
  protocolName: string;
  portStart: number;
  portEnd: number;
  portMode: string;
  portStep: number | null;
  lastEvent: string;
  lastEventAt: string;
  exactPortMatch: boolean;
}

export interface CgnatCycleEvent {
  eventId: string;
  deviceId: string;
  eventAt: string;
  receivedAt: string;
  publicIp: string;
  privateIp: string;
  protocol: number;
  protocolName: string;
  portStart: number;
  portEnd: number;
  portMode: string;
  portStep: number | null;
  eventType: 'allocated' | 'deallocated';
}

export interface CgnatAllocationCycle {
  status: 'closed' | 'open' | 'ambiguous';
  allocation: CgnatCycleEvent;
  deallocation: CgnatCycleEvent | null;
  conflictingAllocation: CgnatCycleEvent | null;
  durationSeconds: number | null;
}

export interface DeviceActivity {
  deviceId: string;
  lastReceivedAt: string | null;
  rawRecords24h: number;
  events24h: number;
  parseFailures24h: number;
}

export interface ParseFailureEvidence {
  rawId: string;
  receivedAt: string;
  exporterIp: string;
  sourceType: string;
  parseStatus: string;
  parseError: string;
  parserVersion: string;
  rawPreview: string;
  rawFormat: 'text' | 'base64';
  truncated: boolean;
}

export type A10SharedProtocolRawRecord = RawRecord;

export interface DeviceDiscoveryObservation {
  exporterIp: string;
  vendor: string;
  sourceType: string;
  recordCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  decodedJson: string;
}

export interface CapacityDeviceActivity {
  deviceId: string;
  rawRecords5m: number;
  rawRecords1h: number;
  rawRecords24h: number;
  events5m: number;
  events1h: number;
  events24h: number;
  lastReceivedAt: string | null;
}

export interface CapacitySnapshot {
  devices: CapacityDeviceActivity[];
  peakRawRecordsPerSecond24h: number;
  peakEventsPerSecond24h: number;
  physicalRawBytes: number;
  physicalEventBytes: number;
  physicalRawRows: number;
  physicalEventRows: number;
  tenantRawRows: number;
  tenantEventRows: number;
  firstReceivedAt: string | null;
  lastReceivedAt: string | null;
}

export interface DashboardHighlight {
  ip: string;
  eventCount: number;
}

export interface DashboardTimelinePoint {
  bucket: string;
  allocations: number;
  deallocations: number;
}

export interface DashboardSnapshot {
  summary: {
    rawRecords: number;
    totalEvents: number;
    allocations: number;
    deallocations: number;
    publicIps: number;
    privateIps: number;
    lastEventAt: string | null;
  };
  highlights: {
    publicMostAllocated: DashboardHighlight | null;
    publicMostDeallocated: DashboardHighlight | null;
    privateMostAllocated: DashboardHighlight | null;
  };
  timeline: DashboardTimelinePoint[];
}

export interface PlatformDashboardTenantActivity {
  tenantId: string;
  rawRecords: number;
  totalEvents: number;
  events5m: number;
  parseFailures: number;
  receivingDevices: number;
  lastReceivedAt: string | null;
}

export interface PlatformDashboardTimelinePoint {
  bucket: string;
  rawRecords: number;
  totalEvents: number;
}

export interface PlatformDashboardSnapshot {
  tenants: PlatformDashboardTenantActivity[];
  timeline: PlatformDashboardTimelinePoint[];
}

function clickhouseTime(value: string): string {
  return new Date(value).toISOString().replace('T', ' ').replace('Z', '');
}

function rawRow(record: RawRecord) {
  return {
    raw_id: record.rawId,
    batch_id: record.batchId,
    tenant_id: record.tenantId,
    collector_id: record.collectorId,
    device_id: record.deviceId,
    vendor: record.vendor,
    source_type: record.sourceType,
    exporter_ip: record.exporterIp,
    exporter_port: record.exporterPort,
    local_sequence: record.localSequence,
    received_at: clickhouseTime(record.receivedAt),
    exporter_time: record.exporterTime ? clickhouseTime(record.exporterTime) : null,
    observation_domain_id: record.observationDomainId,
    export_sequence: record.exportSequence,
    template_id: record.templateId,
    payload_format: record.payloadFormat,
    raw_payload: record.rawPayload,
    raw_sha256: record.rawSha256,
    decoded_json: record.decodedJson,
    parse_status: record.parseStatus,
    parser_version: record.parserVersion,
    parse_error: record.parseError
  };
}

function eventRow(event: CgnatEvent) {
  return {
    event_id: event.eventId,
    raw_id: event.rawId,
    batch_id: event.batchId,
    record_index: event.recordIndex,
    tenant_id: event.tenantId,
    collector_id: event.collectorId,
    device_id: event.deviceId,
    vendor: event.vendor,
    source_type: event.sourceType,
    event_at: clickhouseTime(event.eventAt),
    received_at: clickhouseTime(event.receivedAt),
    public_ip: event.publicIp,
    private_ip: event.privateIp,
    protocol: event.protocol,
    protocol_name: event.protocolName,
    port_start: event.portStart,
    port_end: event.portEnd,
    port_mode: event.portMode,
    port_step: event.portStep,
    port_count: event.portCount,
    event_type: event.eventType,
    event_type_raw: event.eventTypeRaw,
    vendor_fields: event.vendorFields,
    parser_version: event.parserVersion
  };
}

export class ClickHouseRepository {
  private readonly client: ClickHouseClient;

  constructor(options: { url: string; username: string; password: string; database: string }) {
    this.client = createClient(options);
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  async ping(): Promise<void> {
    const response = await this.client.ping();
    if (!response.success) throw response.error;
  }

  async *exportTenantTable(
    table: 'ingest_raw' | 'cgnat_events' | 'server_metrics',
    tenantId: string
  ): AsyncGenerator<string> {
    const allowed = new Set(['ingest_raw', 'cgnat_events', 'server_metrics']);
    if (!allowed.has(table)) throw new Error('Tabela de exportação inválida');
    const result = await this.client.query({
      query: `SELECT * FROM ${table} WHERE tenant_id = {tenantId:UUID}`,
      query_params: { tenantId },
      format: 'JSONEachRow'
    });
    for await (const rows of result.stream()) {
      for (const row of rows) yield `${row.text}\n`;
    }
  }

  async getReplicationHealth(): Promise<{
    replicatedTables: number; readonlyTables: number; queueSize: number;
    absoluteDelaySeconds: number; activeReplicas: number | null; totalReplicas: number | null;
    sessionExpired: boolean; replicationMode: 'keeper' | 'async-source' | 'async-standby';
  }> {
    const result = await this.client.query({
      query: `
        SELECT
          count() AS replicated_tables,
          sum(is_readonly) AS readonly_tables,
          sum(queue_size) AS queue_size,
          max(absolute_delay) AS absolute_delay_seconds,
          min(active_replicas) AS active_replicas,
          min(total_replicas) AS total_replicas,
          max(is_session_expired) AS session_expired
        FROM system.replicas
        WHERE database = currentDatabase()
      `,
      format: 'JSONEachRow'
    });
    const [row] = await result.json<Record<string, string | number>>();
    const tables = Number(row?.replicated_tables ?? 0);
    if (tables > 0) return {
      replicatedTables: tables, readonlyTables: Number(row?.readonly_tables ?? 0),
      queueSize: Number(row?.queue_size ?? 0), absoluteDelaySeconds: Number(row?.absolute_delay_seconds ?? 0),
      activeReplicas: tables ? Number(row?.active_replicas ?? 0) : null,
      totalReplicas: tables ? Number(row?.total_replicas ?? 0) : null,
      sessionExpired: Boolean(Number(row?.session_expired ?? 0)), replicationMode: 'keeper'
    };

    const topologyResult = await this.client.query({
      query: `
        SELECT
          countIf(name IN ('ingest_raw', 'cgnat_events', 'server_metrics')) AS data_tables,
          countIf(name = 'dr_mirror_state') AS state_tables
        FROM system.tables
        WHERE database = currentDatabase()
      `,
      format: 'JSONEachRow'
    });
    const [topology] = await topologyResult.json<Record<string, string | number>>();
    const dataTables = Number(topology?.data_tables ?? 0);
    const hasStateTable = Number(topology?.state_tables ?? 0) > 0;
    if (!hasStateTable) return {
      replicatedTables: dataTables, readonlyTables: 0, queueSize: 0, absoluteDelaySeconds: 0,
      activeReplicas: 1, totalReplicas: 2, sessionExpired: false, replicationMode: 'async-source'
    };
    const stateResult = await this.client.query({
      query: `
        SELECT
          count() AS state_rows,
          countIf(source_max_ms > watermark_ms) AS pending_tables,
          greatest(
            ifNull(max(if(source_max_ms > watermark_ms, (source_max_ms - watermark_ms) / 1000, 0)), 0),
            ifNull(dateDiff('second', max(last_success_at), now64(3)), 0)
          ) AS delay_seconds,
          countIf(last_error != '') AS error_tables
        FROM dr_mirror_state FINAL
      `,
      format: 'JSONEachRow'
    });
    const [state] = await stateResult.json<Record<string, string | number>>();
    const stateRows = Number(state?.state_rows ?? 0);
    if (stateRows === 0) return {
      replicatedTables: dataTables, readonlyTables: 0, queueSize: 0, absoluteDelaySeconds: 0,
      activeReplicas: 1, totalReplicas: 2, sessionExpired: false, replicationMode: 'async-source'
    };
    const errors = Number(state?.error_tables ?? 0);
    return {
      replicatedTables: dataTables, readonlyTables: errors, queueSize: Number(state?.pending_tables ?? 0),
      absoluteDelaySeconds: Math.max(0, Number(state?.delay_seconds ?? 0)), activeReplicas: errors ? 1 : 2,
      totalReplicas: 2, sessionExpired: false, replicationMode: 'async-standby'
    };
  }

  async insertBatch(batch: IngestBatch): Promise<void> {
    const settings = {
      async_insert: 1,
      wait_for_async_insert: 1,
      async_insert_deduplicate: 1,
      insert_deduplication_token: batch.batchId,
      date_time_input_format: 'best_effort'
    } as const;

    await this.client.insert({
      table: 'ingest_raw',
      values: batch.rawRecords.map(rawRow),
      format: 'JSONEachRow',
      clickhouse_settings: settings
    });
    if (batch.events.length) {
      await this.client.insert({
        table: 'cgnat_events',
        values: batch.events.map(eventRow),
        format: 'JSONEachRow',
        clickhouse_settings: settings
      });
    }
  }

  async listUnrecognizedA10SharedProtocolRecords(limit = 1000): Promise<A10SharedProtocolRawRecord[]> {
    const safeLimit = Math.max(1, Math.min(5000, Math.trunc(limit)));
    const result = await this.client.query({
      query: `
        SELECT
          toString(raw_id) AS raw_id,
          toString(batch_id) AS batch_id,
          toString(tenant_id) AS tenant_id,
          toString(collector_id) AS collector_id,
          toString(device_id) AS device_id,
          vendor,
          source_type,
          exporter_ip,
          exporter_port,
          local_sequence,
          concat(replaceOne(toString(toTimeZone(received_at, 'UTC')), ' ', 'T'), 'Z') AS received_at,
          if(
            isNull(exporter_time),
            NULL,
            concat(replaceOne(toString(toTimeZone(assumeNotNull(exporter_time), 'UTC')), ' ', 'T'), 'Z')
          ) AS exporter_time,
          observation_domain_id,
          export_sequence,
          template_id,
          payload_format,
          raw_payload,
          raw_sha256,
          decoded_json,
          parse_status,
          parser_version,
          parse_error
        FROM ingest_raw FINAL
        WHERE lowerUTF8(vendor) = 'a10'
          AND source_type = 'syslog'
          AND parse_status = 'unrecognized'
          AND (
            position(lowerUTF8(JSONExtractString(decoded_json, 'message')), 'lsn:portbatchv2allocated:- [') > 0
            OR position(lowerUTF8(JSONExtractString(decoded_json, 'message')), 'lsn:portbatchv2freed:- [') > 0
            OR position(lowerUTF8(JSONExtractString(decoded_json, 'message')), 'lsn:portbatchv2allocated:other [') > 0
            OR position(lowerUTF8(JSONExtractString(decoded_json, 'message')), 'lsn:portbatchv2freed:other [') > 0
          )
        ORDER BY received_at, raw_id
        LIMIT {limit:UInt32}
      `,
      query_params: { limit: safeLimit },
      format: 'JSONEachRow'
    });
    const rows = await result.json<{
      raw_id: string;
      batch_id: string;
      tenant_id: string;
      collector_id: string;
      device_id: string;
      vendor: string;
      source_type: RawRecord['sourceType'];
      exporter_ip: string;
      exporter_port: number;
      local_sequence: number;
      received_at: string;
      exporter_time: string | null;
      observation_domain_id: number | null;
      export_sequence: number | null;
      template_id: number | null;
      payload_format: RawRecord['payloadFormat'];
      raw_payload: string;
      raw_sha256: string;
      decoded_json: string;
      parse_status: RawRecord['parseStatus'];
      parser_version: string;
      parse_error: string;
    }>();
    return rows.map((row) => ({
      rawId: row.raw_id,
      batchId: row.batch_id,
      tenantId: row.tenant_id,
      collectorId: row.collector_id,
      deviceId: row.device_id,
      vendor: row.vendor,
      sourceType: row.source_type,
      exporterIp: row.exporter_ip,
      exporterPort: Number(row.exporter_port),
      localSequence: Number(row.local_sequence),
      receivedAt: row.received_at,
      exporterTime: row.exporter_time,
      observationDomainId: row.observation_domain_id === null ? null : Number(row.observation_domain_id),
      exportSequence: row.export_sequence === null ? null : Number(row.export_sequence),
      templateId: row.template_id === null ? null : Number(row.template_id),
      payloadFormat: row.payload_format,
      rawPayload: row.raw_payload,
      rawSha256: row.raw_sha256,
      decodedJson: row.decoded_json,
      parseStatus: row.parse_status,
      parserVersion: row.parser_version,
      parseError: row.parse_error
    }));
  }

  async replaceReprocessedRecords(
    operationId: string,
    rawRecords: RawRecord[],
    events: CgnatEvent[]
  ): Promise<void> {
    const settings = {
      async_insert: 1,
      wait_for_async_insert: 1,
      async_insert_deduplicate: 1,
      insert_deduplication_token: operationId,
      date_time_input_format: 'best_effort'
    } as const;
    if (events.length) {
      await this.client.insert({
        table: 'cgnat_events',
        values: events.map(eventRow),
        format: 'JSONEachRow',
        clickhouse_settings: settings
      });
    }
    if (rawRecords.length) {
      await this.client.insert({
        table: 'ingest_raw',
        values: rawRecords.map(rawRow),
        format: 'JSONEachRow',
        clickhouse_settings: settings
      });
    }
  }

  async insertServerMetric(sample: ServerMetricSample): Promise<void> {
    await this.client.insert({
      table: 'server_metrics',
      values: [{
        tenant_id: sample.tenantId,
        server_id: sample.serverId,
        sampled_at: clickhouseTime(sample.sampledAt),
        cpu_usage_percent: sample.metrics.cpuUsagePercent,
        memory_total_bytes: sample.metrics.memoryTotalBytes,
        memory_used_bytes: sample.metrics.memoryUsedBytes,
        storage_total_bytes: sample.metrics.diskTotalBytes,
        storage_used_bytes: sample.metrics.diskUsedBytes,
        network_received_bytes_per_second: sample.metrics.networkReceivedBytesPerSecond ?? null,
        network_transmitted_bytes_per_second: sample.metrics.networkTransmittedBytesPerSecond ?? null
      }],
      format: 'JSONEachRow',
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 1,
        date_time_input_format: 'best_effort'
      }
    });
  }

  async getServerMetricHistory(input: {
    tenantId: string;
    serverId: string;
    period: ServerHistoryPeriod;
  }): Promise<ServerMetricHistoryPoint[]> {
    const window = serverHistoryWindows[input.period];
    const result = await this.client.query({
      query: `
        SELECT
          concat(replaceOne(toString(toTimeZone(bucket, 'UTC')), ' ', 'T'), 'Z') AS sampled_at,
          round(avg(cpu_usage_percent), 2) AS cpu_usage_percent,
          round(avg(memory_used_bytes / nullIf(memory_total_bytes, 0) * 100), 2) AS memory_usage_percent,
          round(avg(storage_used_bytes / nullIf(storage_total_bytes, 0) * 100), 2) AS storage_usage_percent,
          round(avg(network_received_bytes_per_second), 2) AS network_received_bytes_per_second,
          round(avg(network_transmitted_bytes_per_second), 2) AS network_transmitted_bytes_per_second
        FROM
        (
          SELECT
            toStartOfInterval(sampled_at, toIntervalSecond({bucketSeconds:UInt32})) AS bucket,
            cpu_usage_percent,
            memory_total_bytes,
            memory_used_bytes,
            storage_total_bytes,
            storage_used_bytes,
            network_received_bytes_per_second,
            network_transmitted_bytes_per_second
          FROM server_metrics
          WHERE tenant_id = {tenantId:UUID}
            AND server_id = {serverId:String}
            AND sampled_at >= now64(3) - toIntervalSecond({windowSeconds:UInt32})
            AND sampled_at <= now64(3)
        )
        GROUP BY bucket
        ORDER BY bucket
      `,
      query_params: {
        tenantId: input.tenantId,
        serverId: input.serverId,
        bucketSeconds: window.bucketSeconds,
        windowSeconds: window.seconds
      },
      format: 'JSONEachRow'
    });
    const rows = await result.json<{
      sampled_at: string;
      cpu_usage_percent: number | null;
      memory_usage_percent: number | null;
      storage_usage_percent: number | null;
      network_received_bytes_per_second: number | null;
      network_transmitted_bytes_per_second: number | null;
    }>();
    const nullableNumber = (value: number | null): number | null => value === null ? null : Number(value);
    return rows.map((row) => ({
      sampledAt: row.sampled_at,
      cpuUsagePercent: nullableNumber(row.cpu_usage_percent),
      memoryUsagePercent: nullableNumber(row.memory_usage_percent),
      storageUsagePercent: nullableNumber(row.storage_usage_percent),
      networkReceivedBytesPerSecond: nullableNumber(row.network_received_bytes_per_second),
      networkTransmittedBytesPerSecond: nullableNumber(row.network_transmitted_bytes_per_second)
    }));
  }

  async countBatch(batchId: string): Promise<{ rawCount: number; eventCount: number }> {
    const result = await this.client.query({
      query: `
        SELECT
          (SELECT uniqExact(raw_id) FROM ingest_raw WHERE batch_id = {batchId:UUID}) AS raw_count,
          (SELECT uniqExact(event_id) FROM cgnat_events WHERE batch_id = {batchId:UUID}) AS event_count
      `,
      query_params: { batchId },
      format: 'JSONEachRow'
    });
    const rows = await result.json<{ raw_count: string; event_count: string }>();
    const row = rows[0];
    return { rawCount: Number(row?.raw_count ?? 0), eventCount: Number(row?.event_count ?? 0) };
  }

  async getDeviceActivity(tenantId: string | null): Promise<DeviceActivity[]> {
    const tenantFilter = tenantId ? 'tenant_id = {tenantId:UUID} AND' : '';
    const queryParams = tenantId ? { tenantId } : {};
    const [rawResult, eventResult] = await Promise.all([
      this.client.query({
        query: `
          SELECT
            toString(device_id) AS device_id,
            concat(replaceOne(toString(toTimeZone(max(received_at), 'UTC')), ' ', 'T'), 'Z') AS last_received_at,
            countIf(received_at >= now64(3) - INTERVAL 24 HOUR) AS raw_records_24h,
            countIf(
              received_at >= now64(3) - INTERVAL 24 HOUR
              AND parse_status IN ('unrecognized', 'missing_template', 'error')
            ) AS parse_failures_24h
          FROM ingest_raw FINAL
          WHERE ${tenantFilter} parse_status != 'health_probe'
          GROUP BY device_id
        `,
        query_params: queryParams,
        format: 'JSONEachRow'
      }),
      this.client.query({
        query: `
          SELECT
            toString(device_id) AS device_id,
            countIf(received_at >= now64(3) - INTERVAL 24 HOUR) AS events_24h
          FROM cgnat_events FINAL
          ${tenantId ? 'WHERE tenant_id = {tenantId:UUID}' : ''}
          GROUP BY device_id
        `,
        query_params: queryParams,
        format: 'JSONEachRow'
      })
    ]);
    const rawRows = await rawResult.json<{
      device_id: string;
      last_received_at: string;
      raw_records_24h: string;
      parse_failures_24h: string;
    }>();
    const eventRows = await eventResult.json<{ device_id: string; events_24h: string }>();
    const activity = new Map<string, DeviceActivity>();
    for (const row of rawRows) {
      activity.set(row.device_id, {
        deviceId: row.device_id,
        lastReceivedAt: row.last_received_at || null,
        rawRecords24h: Number(row.raw_records_24h),
        events24h: 0,
        parseFailures24h: Number(row.parse_failures_24h)
      });
    }
    for (const row of eventRows) {
      const current = activity.get(row.device_id) ?? {
        deviceId: row.device_id,
        lastReceivedAt: null,
        rawRecords24h: 0,
        events24h: 0,
        parseFailures24h: 0
      };
      current.events24h = Number(row.events_24h);
      activity.set(row.device_id, current);
    }
    return [...activity.values()];
  }

  async getParseFailureEvidence(tenantId: string, deviceId: string, limit = 8): Promise<ParseFailureEvidence[]> {
    const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
    const result = await this.client.query({
      query: `
        SELECT
          toString(raw_id) AS raw_id,
          concat(replaceOne(toString(toTimeZone(received_at, 'UTC')), ' ', 'T'), 'Z') AS received_at_iso,
          exporter_ip,
          source_type,
          parse_status,
          parse_error,
          parser_version,
          raw_payload
        FROM ingest_raw FINAL
        WHERE tenant_id = {tenantId:UUID}
          AND device_id = {deviceId:UUID}
          AND received_at >= now64(3) - INTERVAL 24 HOUR
          AND parse_status IN ('unrecognized', 'missing_template', 'error')
        ORDER BY received_at DESC
        LIMIT {limit:UInt32}
      `,
      query_params: { tenantId, deviceId, limit: safeLimit },
      format: 'JSONEachRow'
    });
    const rows = await result.json<{
      raw_id: string; received_at_iso: string; exporter_ip: string; source_type: string;
      parse_status: string; parse_error: string; parser_version: string; raw_payload: string;
    }>();
    return rows.map((row) => {
      const raw = Buffer.from(row.raw_payload, 'base64');
      const textPayload = row.source_type === 'syslog';
      const previewLimit = 1800;
      const fullPreview = textPayload
        ? raw.toString('utf8').replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, '�')
        : row.raw_payload;
      return {
        rawId: row.raw_id,
        receivedAt: row.received_at_iso,
        exporterIp: row.exporter_ip,
        sourceType: row.source_type,
        parseStatus: row.parse_status,
        parseError: row.parse_error,
        parserVersion: row.parser_version,
        rawPreview: fullPreview.slice(0, previewLimit),
        rawFormat: textPayload ? 'text' : 'base64',
        truncated: fullPreview.length > previewLimit
      };
    });
  }

  async discoverDevices(input: {
    tenantId: string;
    collectorId: string;
    from: string;
    to: string;
  }): Promise<DeviceDiscoveryObservation[]> {
    const result = await this.client.query({
      query: `
        SELECT
          exporter_ip,
          argMax(vendor, received_at) AS vendor,
          argMax(source_type, received_at) AS source_type,
          uniqExact(raw_id) AS record_count,
          concat(replaceOne(toString(toTimeZone(min(received_at), 'UTC')), ' ', 'T'), 'Z') AS first_seen_at,
          concat(replaceOne(toString(toTimeZone(max(received_at), 'UTC')), ' ', 'T'), 'Z') AS last_seen_at,
          argMax(decoded_json, received_at) AS decoded_json
        FROM ingest_raw
        WHERE tenant_id = {tenantId:UUID}
          AND collector_id = {collectorId:UUID}
          AND received_at >= parseDateTime64BestEffort({from:String}, 3, 'UTC')
          AND received_at <= parseDateTime64BestEffort({to:String}, 3, 'UTC')
        GROUP BY exporter_ip
        ORDER BY exporter_ip
      `,
      query_params: input,
      format: 'JSONEachRow'
    });
    const rows = await result.json<{
      exporter_ip: string; vendor: string; source_type: string; record_count: string;
      first_seen_at: string; last_seen_at: string; decoded_json: string;
    }>();
    return rows.map((row) => ({
      exporterIp: row.exporter_ip,
      vendor: row.vendor,
      sourceType: row.source_type,
      recordCount: Number(row.record_count),
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      decodedJson: row.decoded_json
    }));
  }

  async getCapacitySnapshot(tenantId: string): Promise<CapacitySnapshot> {
    const [rawResult, eventResult, peakResult, storageResult, tenantResult] = await Promise.all([
      this.client.query({
        query: `
          SELECT
            toString(r.device_id) AS device_id,
            countIf(r.received_at >= latest.last_received_at - INTERVAL 5 MINUTE) AS raw_records_5m,
            countIf(r.received_at >= latest.last_received_at - INTERVAL 1 HOUR) AS raw_records_1h,
            count() AS raw_records_24h,
            concat(replaceOne(toString(toTimeZone(latest.last_received_at, 'UTC')), ' ', 'T'), 'Z') AS last_received_at
          FROM ingest_raw AS r
          INNER JOIN
          (
            SELECT device_id, max(received_at) AS last_received_at
            FROM ingest_raw
            WHERE tenant_id = {tenantId:UUID}
              AND parse_status != 'health_probe'
            GROUP BY device_id
          ) AS latest ON latest.device_id = r.device_id
          WHERE r.tenant_id = {tenantId:UUID}
            AND r.parse_status != 'health_probe'
            AND r.received_at >= latest.last_received_at - INTERVAL 24 HOUR
            AND r.received_at <= latest.last_received_at
          GROUP BY r.device_id, latest.last_received_at
        `,
        query_params: { tenantId },
        format: 'JSONEachRow'
      }),
      this.client.query({
        query: `
          SELECT
            toString(e.device_id) AS device_id,
            countIf(e.received_at >= latest.last_received_at - INTERVAL 5 MINUTE) AS events_5m,
            countIf(e.received_at >= latest.last_received_at - INTERVAL 1 HOUR) AS events_1h,
            count() AS events_24h
          FROM cgnat_events AS e
          INNER JOIN
          (
            SELECT device_id, max(received_at) AS last_received_at
            FROM ingest_raw
            WHERE tenant_id = {tenantId:UUID}
              AND parse_status != 'health_probe'
            GROUP BY device_id
          ) AS latest ON latest.device_id = e.device_id
          WHERE e.tenant_id = {tenantId:UUID}
            AND e.received_at >= latest.last_received_at - INTERVAL 24 HOUR
            AND e.received_at <= latest.last_received_at
          GROUP BY e.device_id, latest.last_received_at
        `,
        query_params: { tenantId },
        format: 'JSONEachRow'
      }),
      this.client.query({
        query: `
          SELECT kind, max(per_second) AS peak_per_second
          FROM
          (
            SELECT 'raw' AS kind, toStartOfSecond(received_at) AS received_second, count() AS per_second
            FROM ingest_raw
            WHERE tenant_id = {tenantId:UUID}
              AND received_at >= (
                SELECT max(received_at) - INTERVAL 24 HOUR FROM ingest_raw WHERE tenant_id = {tenantId:UUID}
              )
            GROUP BY received_second
            UNION ALL
            SELECT 'event' AS kind, toStartOfSecond(received_at) AS received_second, count() AS per_second
            FROM cgnat_events
            WHERE tenant_id = {tenantId:UUID}
              AND received_at >= (
                SELECT max(received_at) - INTERVAL 24 HOUR FROM ingest_raw WHERE tenant_id = {tenantId:UUID}
              )
            GROUP BY received_second
          )
          GROUP BY kind
        `,
        query_params: { tenantId },
        format: 'JSONEachRow'
      }),
      this.client.query({
        query: `
          SELECT table, sum(rows) AS rows, sum(bytes_on_disk) AS bytes_on_disk
          FROM system.parts
          WHERE active
            AND database = currentDatabase()
            AND table IN ('ingest_raw', 'cgnat_events')
          GROUP BY table
        `,
        format: 'JSONEachRow'
      }),
      this.client.query({
        query: `
          SELECT
            (SELECT count() FROM ingest_raw WHERE tenant_id = {tenantId:UUID}) AS raw_rows,
            (SELECT count() FROM cgnat_events WHERE tenant_id = {tenantId:UUID}) AS event_rows,
            (SELECT toString(min(received_at)) FROM ingest_raw WHERE tenant_id = {tenantId:UUID}) AS first_received_at,
            (SELECT toString(max(received_at)) FROM ingest_raw WHERE tenant_id = {tenantId:UUID}) AS last_received_at
        `,
        query_params: { tenantId },
        format: 'JSONEachRow'
      })
    ]);

    const rawRows = await rawResult.json<{
      device_id: string;
      raw_records_5m: string;
      raw_records_1h: string;
      raw_records_24h: string;
      last_received_at: string;
    }>();
    const eventRows = await eventResult.json<{
      device_id: string;
      events_5m: string;
      events_1h: string;
      events_24h: string;
    }>();
    const peakRows = await peakResult.json<{ kind: 'raw' | 'event'; peak_per_second: string }>();
    const storageRows = await storageResult.json<{ table: string; rows: string; bytes_on_disk: string }>();
    const tenantRows = await tenantResult.json<{
      raw_rows: string;
      event_rows: string;
      first_received_at: string;
      last_received_at: string;
    }>();

    const devices = new Map<string, CapacityDeviceActivity>();
    for (const row of rawRows) {
      devices.set(row.device_id, {
        deviceId: row.device_id,
        rawRecords5m: Number(row.raw_records_5m),
        rawRecords1h: Number(row.raw_records_1h),
        rawRecords24h: Number(row.raw_records_24h),
        events5m: 0,
        events1h: 0,
        events24h: 0,
        lastReceivedAt: row.last_received_at || null
      });
    }
    for (const row of eventRows) {
      const current = devices.get(row.device_id) ?? {
        deviceId: row.device_id,
        rawRecords5m: 0,
        rawRecords1h: 0,
        rawRecords24h: 0,
        events5m: 0,
        events1h: 0,
        events24h: 0,
        lastReceivedAt: null
      };
      current.events5m = Number(row.events_5m);
      current.events1h = Number(row.events_1h);
      current.events24h = Number(row.events_24h);
      devices.set(row.device_id, current);
    }
    const storage = new Map(storageRows.map((row) => [row.table, row]));
    const rawStorage = storage.get('ingest_raw');
    const eventStorage = storage.get('cgnat_events');
    const totals = tenantRows[0];
    const normalizeCoverage = (value: string | undefined) => !value || value.startsWith('1970-01-01') ? null : `${value.replace(' ', 'T')}Z`;
    return {
      devices: [...devices.values()],
      peakRawRecordsPerSecond24h: Number(peakRows.find((row) => row.kind === 'raw')?.peak_per_second ?? 0),
      peakEventsPerSecond24h: Number(peakRows.find((row) => row.kind === 'event')?.peak_per_second ?? 0),
      physicalRawBytes: Number(rawStorage?.bytes_on_disk ?? 0),
      physicalEventBytes: Number(eventStorage?.bytes_on_disk ?? 0),
      physicalRawRows: Number(rawStorage?.rows ?? 0),
      physicalEventRows: Number(eventStorage?.rows ?? 0),
      tenantRawRows: Number(totals?.raw_rows ?? 0),
      tenantEventRows: Number(totals?.event_rows ?? 0),
      firstReceivedAt: normalizeCoverage(totals?.first_received_at),
      lastReceivedAt: normalizeCoverage(totals?.last_received_at)
    };
  }

  async getDashboardSnapshot(input: {
    tenantId: string;
    from: string;
    to: string;
    bucket: 'hour' | 'day';
  }): Promise<DashboardSnapshot> {
    const commonParams = { tenantId: input.tenantId, from: input.from, to: input.to };
    const topQuery = (address: 'public_ip' | 'private_ip', eventType: 'allocated' | 'deallocated') => this.client.query({
      query: `
        SELECT
          toString(${address}) AS ip,
          count() AS event_count
        FROM cgnat_events
        WHERE tenant_id = {tenantId:UUID}
          AND event_at >= parseDateTime64BestEffort({from:String}, 3, 'UTC')
          AND event_at < parseDateTime64BestEffort({to:String}, 3, 'UTC')
          AND event_type = {eventType:String}
        GROUP BY ${address}
        ORDER BY event_count DESC, ip
        LIMIT 1
      `,
      query_params: { ...commonParams, eventType },
      format: 'JSONEachRow'
    });
    const bucketExpression = input.bucket === 'hour' ? 'toStartOfHour(event_at)' : 'toStartOfDay(event_at)';
    const [summaryResult, publicAllocatedResult, publicDeallocatedResult, privateAllocatedResult, timelineResult] = await Promise.all([
      this.client.query({
        query: `
          SELECT
            (
              SELECT count()
              FROM ingest_raw
              WHERE tenant_id = {tenantId:UUID}
                AND received_at >= parseDateTime64BestEffort({from:String}, 3, 'UTC')
                AND received_at < parseDateTime64BestEffort({to:String}, 3, 'UTC')
            ) AS raw_records,
            count() AS total_events,
            countIf(event_type = 'allocated') AS allocations,
            countIf(event_type = 'deallocated') AS deallocations,
            uniqExact(public_ip) AS public_ips,
            uniqExact(private_ip) AS private_ips,
            if(
              count() = 0,
              '',
              concat(replaceOne(toString(toTimeZone(max(event_at), 'UTC')), ' ', 'T'), 'Z')
            ) AS last_event_at
          FROM cgnat_events
          WHERE tenant_id = {tenantId:UUID}
            AND event_at >= parseDateTime64BestEffort({from:String}, 3, 'UTC')
            AND event_at < parseDateTime64BestEffort({to:String}, 3, 'UTC')
        `,
        query_params: commonParams,
        format: 'JSONEachRow'
      }),
      topQuery('public_ip', 'allocated'),
      topQuery('public_ip', 'deallocated'),
      topQuery('private_ip', 'allocated'),
      this.client.query({
        query: `
          SELECT
            concat(replaceOne(toString(toTimeZone(${bucketExpression}, 'UTC')), ' ', 'T'), 'Z') AS bucket,
            countIf(event_type = 'allocated') AS allocations,
            countIf(event_type = 'deallocated') AS deallocations
          FROM cgnat_events
          WHERE tenant_id = {tenantId:UUID}
            AND event_at >= parseDateTime64BestEffort({from:String}, 3, 'UTC')
            AND event_at < parseDateTime64BestEffort({to:String}, 3, 'UTC')
          GROUP BY ${bucketExpression}
          ORDER BY ${bucketExpression}
        `,
        query_params: commonParams,
        format: 'JSONEachRow'
      })
    ]);
    const summaryRows = await summaryResult.json<{
      raw_records: string; total_events: string; allocations: string; deallocations: string;
      public_ips: string; private_ips: string; last_event_at: string;
    }>();
    const readHighlight = (rows: Array<{ ip: string; event_count: string }>): DashboardHighlight | null => {
      const row = rows[0];
      return row ? { ip: row.ip, eventCount: Number(row.event_count) } : null;
    };
    const [publicAllocatedRows, publicDeallocatedRows, privateAllocatedRows, timelineRows] = await Promise.all([
      publicAllocatedResult.json<{ ip: string; event_count: string }>(),
      publicDeallocatedResult.json<{ ip: string; event_count: string }>(),
      privateAllocatedResult.json<{ ip: string; event_count: string }>(),
      timelineResult.json<{
        bucket: string; allocations: string; deallocations: string;
      }>()
    ]);
    const publicMostAllocated = readHighlight(publicAllocatedRows);
    const publicMostDeallocated = readHighlight(publicDeallocatedRows);
    const privateMostAllocated = readHighlight(privateAllocatedRows);
    const summary = summaryRows[0];
    return {
      summary: {
        rawRecords: Number(summary?.raw_records ?? 0),
        totalEvents: Number(summary?.total_events ?? 0),
        allocations: Number(summary?.allocations ?? 0),
        deallocations: Number(summary?.deallocations ?? 0),
        publicIps: Number(summary?.public_ips ?? 0),
        privateIps: Number(summary?.private_ips ?? 0),
        lastEventAt: summary?.last_event_at ? summary.last_event_at : null
      },
      highlights: { publicMostAllocated, publicMostDeallocated, privateMostAllocated },
      timeline: timelineRows.map((row) => ({
        bucket: row.bucket,
        allocations: Number(row.allocations),
        deallocations: Number(row.deallocations)
      }))
    };
  }

  async getPlatformDashboardSnapshot(input: {
    tenantIds: string[];
    from: string;
    to: string;
    bucket: 'hour' | 'day';
  }): Promise<PlatformDashboardSnapshot> {
    if (input.tenantIds.length === 0) return { tenants: [], timeline: [] };
    const commonParams = { tenantIds: input.tenantIds, from: input.from, to: input.to };
    const bucketExpression = input.bucket === 'hour' ? 'toStartOfHour(received_at)' : 'toStartOfDay(received_at)';
    const [rawResult, eventResult, timelineResult] = await Promise.all([
      this.client.query({
        query: `
          SELECT
            toString(tenant_id) AS tenant_id_text,
            count() AS raw_records,
            countIf(parse_status IN ('unrecognized', 'missing_template', 'error')) AS parse_failures,
            uniqExactIf(device_id, received_at >= parseDateTime64BestEffort({to:String}, 3, 'UTC') - INTERVAL 5 MINUTE) AS receiving_devices,
            concat(replaceOne(toString(toTimeZone(max(received_at), 'UTC')), ' ', 'T'), 'Z') AS last_received_at
          FROM ingest_raw FINAL
          WHERE tenant_id IN {tenantIds:Array(UUID)}
            AND received_at >= parseDateTime64BestEffort({from:String}, 3, 'UTC')
            AND received_at < parseDateTime64BestEffort({to:String}, 3, 'UTC')
          GROUP BY tenant_id
        `,
        query_params: commonParams,
        format: 'JSONEachRow'
      }),
      this.client.query({
        query: `
          SELECT
            toString(tenant_id) AS tenant_id_text,
            count() AS total_events,
            countIf(received_at >= parseDateTime64BestEffort({to:String}, 3, 'UTC') - INTERVAL 5 MINUTE) AS events_5m
          FROM cgnat_events FINAL
          WHERE tenant_id IN {tenantIds:Array(UUID)}
            AND received_at >= parseDateTime64BestEffort({from:String}, 3, 'UTC')
            AND received_at < parseDateTime64BestEffort({to:String}, 3, 'UTC')
          GROUP BY tenant_id
        `,
        query_params: commonParams,
        format: 'JSONEachRow'
      }),
      this.client.query({
        query: `
          SELECT
            concat(replaceOne(toString(toTimeZone(bucket, 'UTC')), ' ', 'T'), 'Z') AS bucket,
            sum(raw_records) AS raw_records,
            sum(total_events) AS total_events
          FROM (
            SELECT ${bucketExpression} AS bucket, count() AS raw_records, toUInt64(0) AS total_events
            FROM ingest_raw FINAL
            WHERE tenant_id IN {tenantIds:Array(UUID)}
              AND received_at >= parseDateTime64BestEffort({from:String}, 3, 'UTC')
              AND received_at < parseDateTime64BestEffort({to:String}, 3, 'UTC')
            GROUP BY bucket
            UNION ALL
            SELECT ${bucketExpression} AS bucket, toUInt64(0) AS raw_records, count() AS total_events
            FROM cgnat_events FINAL
            WHERE tenant_id IN {tenantIds:Array(UUID)}
              AND received_at >= parseDateTime64BestEffort({from:String}, 3, 'UTC')
              AND received_at < parseDateTime64BestEffort({to:String}, 3, 'UTC')
            GROUP BY bucket
          )
          GROUP BY bucket
          ORDER BY bucket
        `,
        query_params: commonParams,
        format: 'JSONEachRow'
      })
    ]);
    const [rawRows, eventRows, timelineRows] = await Promise.all([
      rawResult.json<{
        tenant_id_text: string; raw_records: string; parse_failures: string;
        receiving_devices: string; last_received_at: string;
      }>(),
      eventResult.json<{ tenant_id_text: string; total_events: string; events_5m: string }>(),
      timelineResult.json<{ bucket: string; raw_records: string; total_events: string }>()
    ]);
    const eventsByTenant = new Map(eventRows.map((row) => [row.tenant_id_text, row]));
    const rawByTenant = new Map(rawRows.map((row) => [row.tenant_id_text, row]));
    return {
      tenants: input.tenantIds.map((tenantId) => {
        const raw = rawByTenant.get(tenantId);
        return {
          tenantId,
          rawRecords: Number(raw?.raw_records ?? 0),
          totalEvents: Number(eventsByTenant.get(tenantId)?.total_events ?? 0),
          events5m: Number(eventsByTenant.get(tenantId)?.events_5m ?? 0),
          parseFailures: Number(raw?.parse_failures ?? 0),
          receivingDevices: Number(raw?.receiving_devices ?? 0),
          lastReceivedAt: raw?.last_received_at || null
        };
      }),
      timeline: timelineRows.map((row) => ({
        bucket: row.bucket,
        rawRecords: Number(row.raw_records),
        totalEvents: Number(row.total_events)
      }))
    };
  }

  async deleteTenantData(tenantId: string): Promise<{ rawRowsDeleted: number; eventRowsDeleted: number }> {
    const countResult = await this.client.query({
      query: `
        SELECT
          (SELECT count() FROM ingest_raw WHERE tenant_id = {tenantId:UUID}) AS raw_rows,
          (SELECT count() FROM cgnat_events WHERE tenant_id = {tenantId:UUID}) AS event_rows
      `,
      query_params: { tenantId },
      format: 'JSONEachRow'
    });
    const counts = await countResult.json<{ raw_rows: string; event_rows: string }>();
    const rawRowsDeleted = Number(counts[0]?.raw_rows ?? 0);
    const eventRowsDeleted = Number(counts[0]?.event_rows ?? 0);
    await this.client.command({
      query: `ALTER TABLE ingest_raw DELETE WHERE tenant_id = {tenantId:UUID}`,
      query_params: { tenantId },
      clickhouse_settings: { mutations_sync: '2' }
    });
    await this.client.command({
      query: `ALTER TABLE cgnat_events DELETE WHERE tenant_id = {tenantId:UUID}`,
      query_params: { tenantId },
      clickhouse_settings: { mutations_sync: '2' }
    });
    await this.client.command({
      query: `ALTER TABLE server_metrics DELETE WHERE tenant_id = {tenantId:UUID}`,
      query_params: { tenantId },
      clickhouse_settings: { mutations_sync: '2' }
    });
    const verification = await this.client.query({
      query: `
        SELECT
          (SELECT count() FROM ingest_raw WHERE tenant_id = {tenantId:UUID}) AS raw_rows,
          (SELECT count() FROM cgnat_events WHERE tenant_id = {tenantId:UUID}) AS event_rows,
          (SELECT count() FROM server_metrics WHERE tenant_id = {tenantId:UUID}) AS metric_rows
      `,
      query_params: { tenantId },
      format: 'JSONEachRow'
    });
    const remaining = await verification.json<{ raw_rows: string; event_rows: string; metric_rows: string }>();
    if (
      Number(remaining[0]?.raw_rows ?? 0) !== 0
      || Number(remaining[0]?.event_rows ?? 0) !== 0
      || Number(remaining[0]?.metric_rows ?? 0) !== 0
    ) {
      throw new Error('ClickHouse ainda contém registros do tenant após a mutação de exclusão');
    }
    return { rawRowsDeleted, eventRowsDeleted };
  }

  async search(input: CgnatSearchInput): Promise<CgnatSearchRow[]> {
    const protocolFilter = input.protocol === null ? '' : 'AND e.protocol = {protocol:UInt8}';
    const portFilter = input.port === null ? '' : `
      AND e.port_start <= {port:UInt16}
      AND e.port_end >= {port:UInt16}
      AND (
        e.port_mode = 'unknown'
        OR e.port_mode = 'contiguous'
        OR (
          e.port_mode = 'strided'
          AND e.port_step IS NOT NULL
          AND modulo(toInt64({port:UInt16}) - toInt64(e.port_start), toInt64(e.port_step)) = 0
        )
      )
    `;
    const result = await this.client.query({
      query: `
        SELECT
          toString(e.device_id) AS device_id,
          toString(e.public_ip) AS public_ip,
          toString(e.private_ip) AS private_ip,
          e.protocol,
          any(e.protocol_name) AS protocol_name,
          e.port_start,
          e.port_end,
          e.port_mode,
          e.port_step,
          toString(argMax(event_id, tuple(event_at, received_at, event_id))) AS last_event_id,
          argMax(event_type, tuple(event_at, received_at, event_id)) AS last_event,
          concat(
            replaceOne(toString(toTimeZone(argMax(event_at, tuple(event_at, received_at, event_id)), 'UTC')), ' ', 'T'),
            'Z'
          ) AS last_event_at
        FROM cgnat_events AS e
        WHERE e.tenant_id = {tenantId:UUID}
          AND e.public_ip = toIPv4({publicIp:String})
          AND e.event_at <= parseDateTime64BestEffort({at:String}, 3, 'UTC')
          ${protocolFilter}
          ${portFilter}
        GROUP BY e.device_id, e.public_ip, e.private_ip, e.protocol, e.port_start, e.port_end, e.port_mode, e.port_step
        HAVING last_event = 'allocated'
        ORDER BY private_ip, protocol, port_start
        LIMIT 10000
      `,
      query_params: {
        tenantId: input.tenantId,
        publicIp: input.publicIp,
        at: input.at,
        ...(input.protocol === null ? {} : { protocol: input.protocol }),
        ...(input.port === null ? {} : { port: input.port })
      },
      format: 'JSONEachRow'
    });
    const rows = await result.json<{
      device_id: string;
      last_event_id: string;
      public_ip: string;
      private_ip: string;
      protocol: number;
      protocol_name: string;
      port_start: number;
      port_end: number;
      port_mode: string;
      port_step: number | null;
      last_event: string;
      last_event_at: string;
    }>();
    return rows.map((row) => ({
      deviceId: row.device_id,
      lastEventId: row.last_event_id,
      publicIp: row.public_ip,
      privateIp: row.private_ip,
      protocol: Number(row.protocol),
      protocolName: row.protocol_name,
      portStart: Number(row.port_start),
      portEnd: Number(row.port_end),
      portMode: row.port_mode,
      portStep: row.port_step === null ? null : Number(row.port_step),
      lastEvent: row.last_event,
      lastEventAt: row.last_event_at,
      exactPortMatch: input.port === null || row.port_mode !== 'unknown'
    }));
  }

  async getAllocationCycle(input: { tenantId: string; eventId: string }): Promise<CgnatAllocationCycle | null> {
    type CycleEventRow = {
      event_id: string;
      device_id: string;
      event_at: string;
      received_at: string;
      public_ip: string;
      private_ip: string;
      protocol: number;
      protocol_name: string;
      port_start: number;
      port_end: number;
      port_mode: string;
      port_step: number | null;
      event_type: 'allocated' | 'deallocated';
    };
    const eventColumns = `
      toString(e.event_id) AS event_id,
      toString(e.device_id) AS device_id,
      concat(replaceOne(toString(toTimeZone(e.event_at, 'UTC')), ' ', 'T'), 'Z') AS event_at,
      concat(replaceOne(toString(toTimeZone(e.received_at, 'UTC')), ' ', 'T'), 'Z') AS received_at,
      toString(e.public_ip) AS public_ip,
      toString(e.private_ip) AS private_ip,
      e.protocol,
      e.protocol_name,
      e.port_start,
      e.port_end,
      e.port_mode,
      e.port_step,
      e.event_type
    `;
    const mapEvent = (row: CycleEventRow): CgnatCycleEvent => ({
      eventId: row.event_id,
      deviceId: row.device_id,
      eventAt: row.event_at,
      receivedAt: row.received_at,
      publicIp: row.public_ip,
      privateIp: row.private_ip,
      protocol: Number(row.protocol),
      protocolName: row.protocol_name,
      portStart: Number(row.port_start),
      portEnd: Number(row.port_end),
      portMode: row.port_mode,
      portStep: row.port_step === null ? null : Number(row.port_step),
      eventType: row.event_type
    });

    const allocationResult = await this.client.query({
      query: `
        SELECT ${eventColumns}
        FROM cgnat_events AS e FINAL
        WHERE e.tenant_id = {tenantId:UUID}
          AND e.event_id = {eventId:UUID}
          AND e.event_type = 'allocated'
        LIMIT 1
      `,
      query_params: input,
      format: 'JSONEachRow'
    });
    const allocationRows = await allocationResult.json<CycleEventRow>();
    if (!allocationRows[0]) return null;
    const allocation = mapEvent(allocationRows[0]);

    const nextResult = await this.client.query({
      query: `
        SELECT ${eventColumns}
        FROM cgnat_events AS e FINAL
        WHERE e.tenant_id = {tenantId:UUID}
          AND e.device_id = {deviceId:UUID}
          AND e.public_ip = toIPv4({publicIp:String})
          AND e.private_ip = toIPv4({privateIp:String})
          AND e.protocol = {protocol:UInt8}
          AND e.port_start = {portStart:UInt16}
          AND e.port_end = {portEnd:UInt16}
          AND e.port_mode = {portMode:String}
          AND ifNull(e.port_step, 0) = {portStep:UInt16}
          AND tuple(e.event_at, e.received_at, e.event_id) > tuple(
            parseDateTime64BestEffort({eventAt:String}, 3, 'UTC'),
            parseDateTime64BestEffort({receivedAt:String}, 3, 'UTC'),
            {eventId:UUID}
          )
        ORDER BY e.event_at, e.received_at, e.event_id
        LIMIT 1
      `,
      query_params: {
        tenantId: input.tenantId,
        eventId: allocation.eventId,
        deviceId: allocation.deviceId,
        publicIp: allocation.publicIp,
        privateIp: allocation.privateIp,
        protocol: allocation.protocol,
        portStart: allocation.portStart,
        portEnd: allocation.portEnd,
        portMode: allocation.portMode,
        portStep: allocation.portStep ?? 0,
        eventAt: allocation.eventAt,
        receivedAt: allocation.receivedAt
      },
      format: 'JSONEachRow'
    });
    const nextRows = await nextResult.json<CycleEventRow>();
    const nextEvent = nextRows[0] ? mapEvent(nextRows[0]) : null;
    if (!nextEvent) {
      return {
        status: 'open',
        allocation,
        deallocation: null,
        conflictingAllocation: null,
        durationSeconds: null
      };
    }
    if (nextEvent.eventType === 'allocated') {
      return {
        status: 'ambiguous',
        allocation,
        deallocation: null,
        conflictingAllocation: nextEvent,
        durationSeconds: null
      };
    }
    return {
      status: 'closed',
      allocation,
      deallocation: nextEvent,
      conflictingAllocation: null,
      durationSeconds: Math.max(0, (Date.parse(nextEvent.eventAt) - Date.parse(allocation.eventAt)) / 1000)
    };
  }
}
