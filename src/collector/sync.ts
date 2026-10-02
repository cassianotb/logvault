import {
  collectorHeartbeatResponseSchema,
  ingestBatchGroupResponseSchema,
  ingestBatchReceiptSchema,
  type CollectorDeviceConfiguration,
  type CollectorHeartbeat,
  type CollectorHeartbeatResponse,
  type IngestBatch,
  type IngestBatchGroupResponse,
  type IngestBatchReceipt
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
  recoveryBatchSize?: number;
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
    private readonly hostMetricsProvider?: () => HostMetrics,
    private readonly groupSender?: (batches: IngestBatch[]) => Promise<IngestBatchGroupResponse>
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
      const pending = this.spool.pendingBatches(destinationId, {
        maxBatches: this.options.recoveryBatchSize ?? 100,
        maxRawRecords: 25000,
        maxEvents: 250000,
        maxBytes: 32 * 1024 * 1024
      });
      if (pending.length) {
        await this.deliverPendingGroup(pending, destinationId);
        return;
      }

      // Sem backlog formado, drena alguns lotes novos por ciclo. A primeira
      // falha interrompe o ciclo; assim, durante uma queda os próximos registros
      // permanecem soltos no spool e voltam agrupados em lotes maiores.
      let acknowledged = 0;
      for (let index = 0; index < (this.options.maxBatchesPerTick ?? 4); index += 1) {
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
      if (acknowledged) this.spool.cleanupAcknowledged(this.options.acknowledgedRetentionHours);
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

  private async deliverPendingGroup(batches: IngestBatch[], destinationId: string): Promise<void> {
    try {
      let result: IngestBatchGroupResponse;
      if (this.groupSender) {
        result = await this.groupSender(batches);
      } else if (this.sender) {
        const receipts: IngestBatchReceipt[] = [];
        for (const batch of batches) {
          await this.sender(batch);
          receipts.push({
            batchId: batch.batchId, status: 'committed', checksum: batch.checksum,
            rawCount: batch.rawRecords.length, eventCount: batch.events.length,
            duplicate: false, repaired: false
          });
        }
        result = { receipts, failures: [] };
      } else {
        result = await sendBatchGroup(batches, this.options.url, this.options.token);
      }

      const expected = new Map(batches.map((batch) => [batch.batchId, batch]));
      const acknowledgements: IngestBatch[] = [];
      const failures = new Map<string, string>();
      for (const receipt of result.receipts) {
        const batch = expected.get(receipt.batchId);
        if (!batch || !validReceipt(batch, receipt)) {
          throw new Error(`Comprovante de persistência divergente para o lote ${receipt.batchId}`);
        }
        expected.delete(receipt.batchId);
        acknowledgements.push(batch);
      }
      for (const failure of result.failures) {
        const batch = expected.get(failure.batchId);
        if (!batch) throw new Error(`Falha inesperada para o lote ${failure.batchId}`);
        expected.delete(failure.batchId);
        failures.set(batch.batchId, failure.error);
      }
      if (expected.size) throw new Error(`Resposta de recuperação omitiu ${expected.size} lote(s)`);

      const acknowledgedAt = new Date().toISOString();
      for (const batch of acknowledgements) {
        this.spool.acknowledge(batch.batchId, acknowledgedAt, destinationId);
      }
      for (const [batchId, error] of failures) this.spool.recordFailure(batchId, error, destinationId);
      if (acknowledgements.length) this.spool.cleanupAcknowledged(this.options.acknowledgedRetentionHours);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const batch of batches) this.spool.recordFailure(batch.batchId, message, destinationId);
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
          message: 'Conexão com a API restabelecida; entregas pendentes serão recuperadas em grupo'
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
  if (!validReceipt(batch, receipt)) {
    throw new Error(`Comprovante de persistência divergente para o lote ${batch.batchId}`);
  }
}

function validReceipt(batch: IngestBatch, receipt: IngestBatchReceipt): boolean {
  return receipt.batchId === batch.batchId
    && receipt.checksum === batch.checksum
    && receipt.rawCount === batch.rawRecords.length
    && receipt.eventCount === batch.events.length;
}

async function sendBatchGroup(batches: IngestBatch[], url: string, token: string): Promise<IngestBatchGroupResponse> {
  if (batches.length === 1) {
    await sendBatch(batches[0]!, url, token);
    const batch = batches[0]!;
    return {
      receipts: [{
        batchId: batch.batchId, status: 'committed', checksum: batch.checksum,
        rawCount: batch.rawRecords.length, eventCount: batch.events.length,
        duplicate: false, repaired: false
      }],
      failures: []
    };
  }
  const bulkUrl = `${url.replace(/\/$/, '')}/bulk`;
  const response = await fetch(bulkUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ batches }),
    signal: AbortSignal.timeout(BATCH_REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Recuperação em massa recusada: HTTP ${response.status} ${await response.text()}`);
  return ingestBatchGroupResponseSchema.parse(await response.json());
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
