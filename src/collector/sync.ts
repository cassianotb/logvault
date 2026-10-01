import {
  collectorHeartbeatResponseSchema,
  ingestBatchReceiptSchema,
  type CollectorDeviceConfiguration,
  type CollectorHeartbeat,
  type CollectorHeartbeatResponse,
  type IngestBatch
} from '../domain/models.js';
import type { HostMetrics } from '../core/host-metrics.js';
import { CollectorSpool } from './spool.js';

const BATCH_REQUEST_TIMEOUT_MS = 30_000;

export interface SyncOptions {
  destinationId?: string;
  url: string;
  token: string;
  batchSize: number;
  intervalMs: number;
  maxBatchesPerTick?: number;
  acknowledgedRetentionHours: number;
  heartbeatUrl: string;
  heartbeatIntervalMs: number;
  tenantId: string;
  collectorId: string;
  version: string;
  netflowPort: number;
  syslogPort: number;
}

export class BatchSynchronizer {
  private timer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private running = false;
  private heartbeatRunning = false;
  private heartbeatHealthy: boolean | undefined;

  constructor(
    private readonly spool: CollectorSpool,
    private readonly options: SyncOptions,
    private readonly sender?: (batch: IngestBatch) => Promise<void>,
    private readonly heartbeatSender?: (heartbeat: CollectorHeartbeat) => Promise<CollectorHeartbeatResponse>,
    private readonly configurationReceiver?: (devices: CollectorDeviceConfiguration[]) => void,
    private readonly hostMetricsProvider?: () => HostMetrics
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.options.intervalMs);
    this.timer.unref();
    this.heartbeatTimer = setInterval(() => void this.heartbeat(), this.options.heartbeatIntervalMs);
    this.heartbeatTimer.unref();
    void this.tick();
    void this.heartbeat();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.timer = undefined;
    this.heartbeatTimer = undefined;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const destinationId = this.options.destinationId ?? 'primary';
      const maximum = this.options.maxBatchesPerTick ?? 4;
      let acknowledged = 0;
      for (let index = 0; index < maximum; index += 1) {
        const batch = this.spool.nextBatch(this.options.batchSize, destinationId);
        if (!batch) break;
        try {
          if (this.sender) await this.sender(batch);
          else await sendBatch(batch, this.options.url, this.options.token);
          this.spool.acknowledge(batch.batchId, new Date().toISOString(), destinationId);
          acknowledged += 1;
        } catch (error) {
          this.spool.recordFailure(
            batch.batchId,
            error instanceof Error ? error.message : String(error),
            destinationId
          );
          break;
        }
      }
      if (acknowledged > 0) this.spool.cleanupAcknowledged(this.options.acknowledgedRetentionHours);
    } catch (error) {
      console.warn(JSON.stringify({
        level: 'warn',
        component: 'batch-sync',
        destinationId: this.options.destinationId ?? 'primary',
        message: 'Sincronização adiada; o spool permanece preservado para nova tentativa',
        error: error instanceof Error ? error.message : String(error)
      }));
    } finally {
      this.running = false;
    }
  }

  async heartbeat(): Promise<void> {
    if (this.heartbeatRunning) return;
    this.heartbeatRunning = true;
    try {
      const heartbeat: CollectorHeartbeat = {
        tenantId: this.options.tenantId,
        collectorId: this.options.collectorId,
        version: this.options.version,
        sentAt: new Date().toISOString(),
        netflowPort: this.options.netflowPort,
        syslogPort: this.options.syslogPort,
        ...this.spool.statistics(this.options.tenantId, this.options.collectorId),
        ...(this.hostMetricsProvider ? { hostMetrics: this.hostMetricsProvider() } : {})
      };
      const response = this.heartbeatSender
        ? await this.heartbeatSender(heartbeat)
        : await sendHeartbeat(heartbeat, this.options.heartbeatUrl, this.options.token);
      this.configurationReceiver?.(response.devices);
      if (this.heartbeatHealthy === false) {
        console.info(JSON.stringify({
          level: 'info', component: 'heartbeat', destinationId: this.options.destinationId ?? 'primary',
          message: 'Conexão com a API restabelecida'
        }));
      }
      this.heartbeatHealthy = true;
    } catch (error) {
      if (this.heartbeatHealthy !== false) {
        console.warn(JSON.stringify({
          level: 'warn',
          component: 'heartbeat',
          destinationId: this.options.destinationId ?? 'primary',
          message: 'Não foi possível reportar a telemetria do coletor',
          error: error instanceof Error ? error.message : String(error)
        }));
      }
      this.heartbeatHealthy = false;
    } finally {
      this.heartbeatRunning = false;
    }
  }
}

async function sendBatch(batch: IngestBatch, url: string, token: string): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(batch),
    signal: AbortSignal.timeout(BATCH_REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Sincronização recusada: HTTP ${response.status} ${await response.text()}`);
  const receipt = ingestBatchReceiptSchema.parse(await response.json());
  if (
    receipt.batchId !== batch.batchId
    || receipt.checksum !== batch.checksum
    || receipt.rawCount !== batch.rawRecords.length
    || receipt.eventCount !== batch.events.length
  ) {
    throw new Error(`Comprovante de persistência divergente para o lote ${batch.batchId}`);
  }
}

async function sendHeartbeat(heartbeat: CollectorHeartbeat, url: string, token: string): Promise<CollectorHeartbeatResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(heartbeat),
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`Heartbeat recusado: HTTP ${response.status} ${await response.text()}`);
  return collectorHeartbeatResponseSchema.parse(await response.json());
}
