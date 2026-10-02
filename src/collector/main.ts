import dgram from 'node:dgram';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadCollectorConfig } from '../config.js';
import { newId, sha256 } from '../core/crypto.js';
import { HostMetricsSampler } from '../core/host-metrics.js';
import type { ParseContext, RawRecord } from '../domain/models.js';
import type { CollectorDeviceConfiguration } from '../domain/models.js';
import {
  A10SyslogParser,
  a10SyslogReportedIp,
  isA10HealthProbe,
  isA10IgnoredProtocolEvent
} from '../parsers/a10-syslog.js';
import { NetflowV9Parser } from '../parsers/netflow-v9.js';
import type { PacketParser } from '../parsers/parser.js';
import { CollectorSpool } from './spool.js';
import { BatchSynchronizer } from './sync.js';
import { ManagedCloudCollectorManager } from './managed-cloud.js';

const config = loadCollectorConfig();
mkdirSync(dirname(config.ARGUS_SPOOL_PATH), { recursive: true });
const spool = new CollectorSpool(config.ARGUS_SPOOL_PATH);
const hostMetrics = new HostMetricsSampler(dirname(config.ARGUS_SPOOL_PATH));
const parsers = {
  netflow_v9: new NetflowV9Parser(spool),
  syslog: new A10SyslogParser()
} satisfies Record<'netflow_v9' | 'syslog', PacketParser>;
const configuredDevices: CollectorDeviceConfiguration[] = config.ARGUS_DEVICES_JSON.map((device) => ({
  exporterIp: device.exporterIp,
  deviceId: device.deviceId,
  vendor: device.vendor,
  timezone: device.timezone
}));
const devicesByExporter = new Map<string, CollectorDeviceConfiguration>();
const unknownExporters = new Set<string>();
const UNREGISTERED_DEVICE_ID = 'ffffffff-ffff-4fff-bfff-ffffffffffff';

function applyDeviceRegistry(devices: CollectorDeviceConfiguration[], persistRegistry: boolean): void {
  devicesByExporter.clear();
  for (const device of devices) devicesByExporter.set(device.exporterIp, device);
  for (const exporterIp of unknownExporters) {
    if (devicesByExporter.has(exporterIp)) unknownExporters.delete(exporterIp);
  }
  if (persistRegistry) spool.saveDeviceRegistry(devices);
}

const cachedDevices = spool.loadDeviceRegistry();
applyDeviceRegistry(cachedDevices ?? configuredDevices, false);

function resolveDevice(
  exporterIp: string,
  sourceType: 'netflow_v9' | 'syslog'
): { deviceId: string; vendor: string } {
  const configured = devicesByExporter.get(exporterIp);
  if (configured) return configured;
  if (devicesByExporter.size > 0 && !unknownExporters.has(exporterIp)) {
    unknownExporters.add(exporterIp);
    console.warn(JSON.stringify({
      level: 'warn',
      component: 'device-registry',
      exporterIp,
      message: 'Exportador não cadastrado; conteúdo preservado como origem não cadastrada'
    }));
  }
  return {
    deviceId: UNREGISTERED_DEVICE_ID,
    vendor: sourceType === 'netflow_v9' ? 'cisco' : 'a10'
  };
}

function persist(payload: Buffer, remote: dgram.RemoteInfo, sourceType: 'netflow_v9' | 'syslog'): void {
  if (
    sourceType === 'syslog'
    && isA10IgnoredProtocolEvent(payload, config.ARGUS_A10_IGNORED_PROTOCOLS)
  ) return;
  const rawId = newId();
  const receivedAt = new Date().toISOString();
  const reportedExporterIp = sourceType === 'syslog' ? a10SyslogReportedIp(payload) : null;
  const exporterIp = reportedExporterIp ?? remote.address;
  const healthProbe = sourceType === 'syslog' && isA10HealthProbe(payload);
  const device = healthProbe
    ? { deviceId: UNREGISTERED_DEVICE_ID, vendor: 'a10' }
    : resolveDevice(exporterIp, sourceType);
  const context: ParseContext = {
    rawId,
    tenantId: config.ARGUS_TENANT_ID,
    collectorId: config.ARGUS_COLLECTOR_ID,
    deviceId: device.deviceId,
    vendor: device.vendor,
    exporterIp,
    exporterPort: remote.port,
    transportIp: remote.address,
    receivedAt
  };
  const parsed = parsers[sourceType].parse(payload, context);
  const raw: RawRecord = {
    rawId,
    batchId: null,
    tenantId: context.tenantId,
    collectorId: context.collectorId,
    deviceId: context.deviceId,
    vendor: context.vendor,
    sourceType,
    exporterIp: context.exporterIp,
    exporterPort: context.exporterPort,
    localSequence: 0,
    receivedAt,
    exporterTime: parsed.exporterTime,
    observationDomainId: parsed.observationDomainId,
    exportSequence: parsed.exportSequence,
    templateId: parsed.templateId,
    payloadFormat: 'base64',
    rawPayload: payload.toString('base64'),
    rawSha256: sha256(payload),
    decodedJson: JSON.stringify(parsed.decoded),
    parseStatus: parsed.status,
    parserVersion: parsed.parserVersion,
    parseError: parsed.error
  };
  spool.append(raw, parsed.events);
}

function createUdpListener(
  name: string,
  host: string,
  port: number,
  sourceType: 'netflow_v9' | 'syslog'
): dgram.Socket {
  const socket = dgram.createSocket('udp4');
  socket.on('error', (error) => console.error(JSON.stringify({ level: 'error', component: name, error: error.message })));
  socket.on('message', (payload, remote) => {
    try {
      persist(payload, remote, sourceType);
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        component: name,
        exporter: remote.address,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  });
  socket.bind(port, host, () => console.log(JSON.stringify({ level: 'info', component: name, host, port })));
  return socket;
}

const netflowSocket = createUdpListener('netflow-v9', config.ARGUS_NETFLOW_HOST, config.ARGUS_NETFLOW_PORT, 'netflow_v9');
const syslogSocket = createUdpListener('syslog', config.ARGUS_SYSLOG_HOST, config.ARGUS_SYSLOG_PORT, 'syslog');
console.log(JSON.stringify({
  level: 'info',
  component: 'device-registry',
  configuredDevices: devicesByExporter.size,
  unregisteredDeviceId: UNREGISTERED_DEVICE_ID
}));
const primarySynchronizer = new BatchSynchronizer(spool, {
  destinationId: 'primary',
  url: config.ARGUS_SYNC_URL,
  token: config.ARGUS_SYNC_TOKEN,
  batchSize: config.ARGUS_SYNC_BATCH_SIZE,
  intervalMs: config.ARGUS_SYNC_INTERVAL_MS,
  maxBatchesPerTick: config.ARGUS_SYNC_MAX_BATCHES_PER_TICK,
  recoveryBatchSize: config.ARGUS_SYNC_RECOVERY_BATCH_SIZE,
  acknowledgedRetentionHours: config.ARGUS_EDGE_ACK_RETENTION_HOURS,
  heartbeatUrl: config.ARGUS_HEARTBEAT_URL,
  heartbeatIntervalMs: config.ARGUS_HEARTBEAT_INTERVAL_MS,
  tenantId: config.ARGUS_TENANT_ID,
  collectorId: config.ARGUS_COLLECTOR_ID,
  version: config.ARGUS_COLLECTOR_VERSION,
  netflowPort: config.ARGUS_NETFLOW_PORT,
  syslogPort: config.ARGUS_SYSLOG_PORT
}, undefined, undefined, (devices) => applyDeviceRegistry(devices, true), () => hostMetrics.sample());
const synchronizers = [primarySynchronizer];
if (config.ARGUS_SECONDARY_SYNC_URL) {
  synchronizers.push(new BatchSynchronizer(spool, {
    destinationId: 'secondary',
    url: config.ARGUS_SECONDARY_SYNC_URL,
    token: config.ARGUS_SECONDARY_SYNC_TOKEN,
    batchSize: config.ARGUS_SYNC_BATCH_SIZE,
    intervalMs: config.ARGUS_SYNC_INTERVAL_MS,
    maxBatchesPerTick: config.ARGUS_SYNC_MAX_BATCHES_PER_TICK,
    recoveryBatchSize: config.ARGUS_SYNC_RECOVERY_BATCH_SIZE,
    acknowledgedRetentionHours: config.ARGUS_EDGE_ACK_RETENTION_HOURS,
    heartbeatUrl: config.ARGUS_SECONDARY_HEARTBEAT_URL,
    heartbeatIntervalMs: config.ARGUS_HEARTBEAT_INTERVAL_MS,
    tenantId: config.ARGUS_TENANT_ID,
    collectorId: config.ARGUS_COLLECTOR_ID,
    version: config.ARGUS_COLLECTOR_VERSION,
    netflowPort: config.ARGUS_NETFLOW_PORT,
    syslogPort: config.ARGUS_SYSLOG_PORT
  }, undefined, undefined, undefined, () => hostMetrics.sample()));
}
spool.configureDestinations(config.ARGUS_SECONDARY_SYNC_URL ? ['primary', 'secondary'] : ['primary']);
for (const item of synchronizers) item.start();
const managedCloud = config.ARGUS_MANAGED_CLOUD_ENABLED
  ? new ManagedCloudCollectorManager(spool, {
      registryUrl: config.ARGUS_MANAGED_CLOUD_REGISTRY_URL,
      token: config.ARGUS_SYNC_TOKEN,
      version: config.ARGUS_COLLECTOR_VERSION,
      host: config.ARGUS_NETFLOW_HOST,
      heartbeatIntervalMs: config.ARGUS_HEARTBEAT_INTERVAL_MS,
      ignoredA10Protocols: config.ARGUS_A10_IGNORED_PROTOCOLS,
      baseTenantId: config.ARGUS_TENANT_ID,
      baseCollectorId: config.ARGUS_COLLECTOR_ID
    }, () => hostMetrics.sample())
  : null;
managedCloud?.start();

function shutdown(signal: string): void {
  console.log(JSON.stringify({ level: 'info', message: 'Encerrando coletor', signal }));
  for (const item of synchronizers) item.stop();
  managedCloud?.stop();
  netflowSocket.close();
  syslogSocket.close();
  spool.close();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
