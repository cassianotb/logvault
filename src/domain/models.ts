import { z } from 'zod';

export const canonicalEventTypeSchema = z.enum(['allocated', 'deallocated']);
export type CanonicalEventType = z.infer<typeof canonicalEventTypeSchema>;

export const cgnatEventSchema = z.object({
  eventId: z.string().uuid(),
  rawId: z.string().uuid(),
  batchId: z.string().uuid().nullable(),
  recordIndex: z.number().int().min(0).max(65535),
  tenantId: z.string().uuid(),
  collectorId: z.string().uuid(),
  deviceId: z.string().uuid(),
  vendor: z.string().min(1),
  sourceType: z.enum(['netflow_v9', 'ipfix', 'syslog']),
  eventAt: z.string().datetime({ offset: true }),
  receivedAt: z.string().datetime({ offset: true }),
  publicIp: z.string().ip({ version: 'v4' }),
  privateIp: z.string().ip({ version: 'v4' }),
  protocol: z.number().int().min(0).max(255),
  protocolName: z.string(),
  portStart: z.number().int().min(0).max(65535),
  portEnd: z.number().int().min(0).max(65535),
  portMode: z.enum(['contiguous', 'strided', 'unknown']),
  portStep: z.number().int().positive().max(65535).nullable(),
  portCount: z.number().int().positive().max(65536).nullable(),
  eventType: canonicalEventTypeSchema,
  eventTypeRaw: z.string().min(1),
  vendorFields: z.record(z.string()),
  parserVersion: z.string().min(1)
});
export type CgnatEvent = z.infer<typeof cgnatEventSchema>;

export const rawRecordSchema = z.object({
  rawId: z.string().uuid(),
  batchId: z.string().uuid().nullable(),
  tenantId: z.string().uuid(),
  collectorId: z.string().uuid(),
  deviceId: z.string().uuid(),
  vendor: z.string().min(1),
  sourceType: z.enum(['netflow_v9', 'ipfix', 'syslog']),
  exporterIp: z.string().min(1),
  exporterPort: z.number().int().min(0).max(65535),
  localSequence: z.number().int().nonnegative(),
  receivedAt: z.string().datetime({ offset: true }),
  exporterTime: z.string().datetime({ offset: true }).nullable(),
  observationDomainId: z.number().int().nonnegative().max(4294967295).nullable(),
  exportSequence: z.number().int().nonnegative().max(4294967295).nullable(),
  templateId: z.number().int().nonnegative().max(65535).nullable(),
  payloadFormat: z.enum(['base64']),
  rawPayload: z.string(),
  rawSha256: z.string().regex(/^[a-f0-9]{64}$/),
  decodedJson: z.string(),
  parseStatus: z.enum(['parsed', 'decoded_unmapped', 'health_probe', 'unrecognized', 'missing_template', 'error']),
  parserVersion: z.string().min(1),
  parseError: z.string()
});
export type RawRecord = z.infer<typeof rawRecordSchema>;

export const ingestBatchSchema = z.object({
  batchId: z.string().uuid(),
  tenantId: z.string().uuid(),
  collectorId: z.string().uuid(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime({ offset: true }),
  rawRecords: z.array(rawRecordSchema).min(1).max(5000),
  events: z.array(cgnatEventSchema).max(100000)
});
export type IngestBatch = z.infer<typeof ingestBatchSchema>;

export const ingestBatchReceiptSchema = z.object({
  batchId: z.string().uuid(),
  status: z.literal('committed'),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  rawCount: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  duplicate: z.boolean(),
  repaired: z.boolean()
});
export type IngestBatchReceipt = z.infer<typeof ingestBatchReceiptSchema>;

export const collectorHeartbeatSchema = z.object({
  tenantId: z.string().uuid(),
  collectorId: z.string().uuid(),
  version: z.string().min(1).max(100),
  sentAt: z.string().datetime({ offset: true }),
  pendingRecords: z.number().int().nonnegative(),
  pendingEvents: z.number().int().nonnegative(),
  pendingBatches: z.number().int().nonnegative(),
  acknowledgedRecordsRetained: z.number().int().nonnegative(),
  oldestPendingAt: z.string().datetime({ offset: true }).nullable(),
  spoolBytes: z.number().int().nonnegative(),
  lastSyncAt: z.string().datetime({ offset: true }).nullable(),
  lastSyncError: z.string().max(4000),
  netflowPort: z.number().int().min(1).max(65535).optional(),
  syslogPort: z.number().int().min(1).max(65535).optional(),
  hostMetrics: z.object({
    hostname: z.string().min(1).max(255),
    platform: z.string().min(1).max(255),
    uptimeSeconds: z.number().int().nonnegative(),
    cpuUsagePercent: z.number().min(0).max(100).nullable(),
    memoryTotalBytes: z.number().int().nonnegative(),
    memoryUsedBytes: z.number().int().nonnegative(),
    diskTotalBytes: z.number().int().nonnegative().nullable(),
    diskUsedBytes: z.number().int().nonnegative().nullable(),
    networkReceivedBytesPerSecond: z.number().nonnegative().nullable().optional(),
    networkTransmittedBytesPerSecond: z.number().nonnegative().nullable().optional()
  }).refine((metrics) => metrics.memoryUsedBytes <= metrics.memoryTotalBytes, {
    message: 'Uso de memória maior que o total disponível'
  }).refine((metrics) => (
    metrics.diskTotalBytes === null && metrics.diskUsedBytes === null
  ) || (
    metrics.diskTotalBytes !== null && metrics.diskUsedBytes !== null && metrics.diskUsedBytes <= metrics.diskTotalBytes
  ), {
    message: 'Métricas de armazenamento inconsistentes'
  }).optional()
});
export type CollectorHeartbeat = z.infer<typeof collectorHeartbeatSchema>;

export const managedCloudCollectorTelemetrySchema = collectorHeartbeatSchema.omit({
  version: true,
  sentAt: true,
  hostMetrics: true
});
export type ManagedCloudCollectorTelemetry = z.infer<typeof managedCloudCollectorTelemetrySchema>;

export const firewallModeSchema = z.enum(['monitor', 'enforce']);
export type FirewallMode = z.infer<typeof firewallModeSchema>;

export const firewallObservationSchema = z.object({
  tenantId: z.string().uuid(),
  collectorId: z.string().uuid(),
  sourceIp: z.string().ip({ version: 'v4' }),
  sourceType: z.enum(['netflow_v9', 'syslog']),
  firstSeenAt: z.string().datetime({ offset: true }),
  lastSeenAt: z.string().datetime({ offset: true }),
  packetCount: z.number().int().positive(),
  blockedPacketCount: z.number().int().nonnegative()
}).refine((observation) => observation.blockedPacketCount <= observation.packetCount, {
  message: 'A contagem bloqueada não pode exceder os pacotes observados',
  path: ['blockedPacketCount']
});
export type FirewallObservation = z.infer<typeof firewallObservationSchema>;

export const appliedFirewallPolicySchema = z.object({
  tenantId: z.string().uuid(),
  collectorId: z.string().uuid(),
  mode: firewallModeSchema,
  policyUpdatedAt: z.string().datetime({ offset: true })
});
export type AppliedFirewallPolicy = z.infer<typeof appliedFirewallPolicySchema>;

export const collectorDeviceConfigurationSchema = z.object({
  exporterIp: z.string().ip({ version: 'v4' }),
  deviceId: z.string().uuid(),
  vendor: z.string().min(1).max(100),
  timezone: z.string().min(1).max(100)
});
export type CollectorDeviceConfiguration = z.infer<typeof collectorDeviceConfigurationSchema>;

export const managedCloudCollectorConfigurationSchema = z.object({
  tenantId: z.string().uuid(),
  collectorId: z.string().uuid(),
  name: z.string().min(1).max(200),
  netflowPort: z.number().int().min(1024).max(65534),
  syslogPort: z.number().int().min(1025).max(65535),
  firewall: z.object({
    mode: firewallModeSchema,
    allowedSources: z.array(z.string().min(3).max(43)).max(1000),
    updatedAt: z.string().datetime({ offset: true })
  }).default({ mode: 'monitor', allowedSources: [], updatedAt: '1970-01-01T00:00:00.000Z' }),
  devices: z.array(collectorDeviceConfigurationSchema).max(1000)
}).refine((collector) => collector.syslogPort === collector.netflowPort + 1, {
  message: 'As portas do coletor Cloud devem ser consecutivas',
  path: ['syslogPort']
});
export type ManagedCloudCollectorConfiguration = z.infer<typeof managedCloudCollectorConfigurationSchema>;

export const managedCloudRegistryResponseSchema = z.object({
  status: z.literal('recorded'),
  receivedAt: z.string().datetime({ offset: true }),
  collectors: z.array(managedCloudCollectorConfigurationSchema).max(1000)
});
export type ManagedCloudRegistryResponse = z.infer<typeof managedCloudRegistryResponseSchema>;

export const collectorHeartbeatResponseSchema = z.object({
  status: z.literal('recorded'),
  receivedAt: z.string().datetime({ offset: true }),
  devices: z.array(collectorDeviceConfigurationSchema).max(1000)
});
export type CollectorHeartbeatResponse = z.infer<typeof collectorHeartbeatResponseSchema>;

export interface ParseContext {
  rawId: string;
  tenantId: string;
  collectorId: string;
  deviceId: string;
  vendor: string;
  exporterIp: string;
  templateNamespace?: string;
  exporterPort: number;
  transportIp?: string;
  receivedAt: string;
}

export interface ParseResult {
  status: RawRecord['parseStatus'];
  parserVersion: string;
  exporterTime: string | null;
  observationDomainId: number | null;
  exportSequence: number | null;
  templateId: number | null;
  decoded: unknown;
  events: CgnatEvent[];
  error: string;
}
