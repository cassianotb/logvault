import dgram from 'node:dgram';
import type { HostMetrics } from '../core/host-metrics.js';
import { newId, sha256 } from '../core/crypto.js';
import type {
  FirewallObservation,
  ManagedCloudCollectorConfiguration,
  ParseContext,
  RawRecord
} from '../domain/models.js';
import { managedCloudRegistryResponseSchema } from '../domain/models.js';
import { ipv4MatchesCidr } from '../core/ipv4-cidr.js';
import {
  A10SyslogParser,
  a10SyslogReportedIp,
  isA10HealthProbe,
  isA10IgnoredProtocolEvent
} from '../parsers/a10-syslog.js';
import { NetflowV9Parser } from '../parsers/netflow-v9.js';
import type { PacketParser } from '../parsers/parser.js';
import { CollectorSpool } from './spool.js';

const UNREGISTERED_DEVICE_ID = 'ffffffff-ffff-4fff-bfff-ffffffffffff';

export interface ManagedCloudOptions {
  registryUrl: string;
  token: string;
  version: string;
  host: string;
  heartbeatIntervalMs: number;
  ignoredA10Protocols: string[];
  baseTenantId: string;
  baseCollectorId: string;
}

type ManagedSourceType = 'netflow_v9' | 'syslog';

interface ActiveCollector {
  netflowSocket: dgram.Socket;
  syslogSocket: dgram.Socket;
  configuration: ManagedCloudCollectorConfiguration;
  devices: Map<string, ManagedCloudCollectorConfiguration['devices'][number]>;
}

export class ManagedCloudCollectorManager {
  private readonly listeners = new Map<string, ActiveCollector>();
  private readonly parsers: Record<ManagedSourceType, PacketParser>;
  private registryTimer: NodeJS.Timeout | undefined;
  private registryRunning = false;
  private firewallObservations = new Map<string, FirewallObservation>();

  constructor(
    private readonly spool: CollectorSpool,
    private readonly options: ManagedCloudOptions,
    private readonly hostMetricsProvider: () => HostMetrics,
    private readonly socketFactory: typeof dgram.createSocket = dgram.createSocket
  ) {
    this.parsers = {
      netflow_v9: new NetflowV9Parser(spool),
      syslog: new A10SyslogParser()
    };
  }

  start(): void {
    if (this.registryTimer) return;
    this.registryTimer = setInterval(() => void this.refreshRegistry(), this.options.heartbeatIntervalMs);
    this.registryTimer.unref();
    void this.refreshRegistry();
  }

  stop(): void {
    if (this.registryTimer) clearInterval(this.registryTimer);
    this.registryTimer = undefined;
    for (const listener of this.listeners.values()) this.close(listener);
    this.listeners.clear();
  }

  private async refreshRegistry(): Promise<void> {
    if (this.registryRunning) return;
    this.registryRunning = true;
    const pendingFirewallObservations = this.firewallObservations;
    this.firewallObservations = new Map();
    try {
      const response = await fetch(this.options.registryUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          version: this.options.version,
          sentAt: new Date().toISOString(),
          hostMetrics: this.hostMetricsProvider(),
          collectorTelemetry: [...this.listeners.values()].map(({ configuration }) => ({
            tenantId: configuration.tenantId,
            collectorId: configuration.collectorId,
            ...this.spool.statistics(configuration.tenantId, configuration.collectorId)
          })),
          firewallObservations: [...pendingFirewallObservations.values()],
          appliedFirewallPolicies: [...this.listeners.values()].map(({ configuration }) => ({
            tenantId: configuration.tenantId,
            collectorId: configuration.collectorId,
            mode: configuration.firewall.mode,
            policyUpdatedAt: configuration.firewall.updatedAt
          }))
        }),
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) throw new Error(`Registro Cloud recusado: HTTP ${response.status} ${await response.text()}`);
      const registry = managedCloudRegistryResponseSchema.parse(await response.json());
      await this.reconcile(registry.collectors);
    } catch (error) {
      this.mergeFirewallObservations(pendingFirewallObservations);
      console.warn(JSON.stringify({
        level: 'warn',
        component: 'managed-cloud-registry',
        message: 'Não foi possível atualizar os coletores Cloud; listeners atuais foram preservados',
        error: error instanceof Error ? error.message : String(error)
      }));
    } finally {
      this.registryRunning = false;
    }
  }

  private async reconcile(configurations: ManagedCloudCollectorConfiguration[]): Promise<void> {
    const desired = new Map(configurations.map((configuration) => [configuration.collectorId, configuration]));
    const closing: Promise<void>[] = [];
    for (const [collectorId, listener] of this.listeners) {
      const configuration = desired.get(collectorId);
      if (configuration
        && listener.configuration.netflowPort === configuration.netflowPort
        && listener.configuration.syslogPort === configuration.syslogPort) continue;
      this.listeners.delete(collectorId);
      closing.push(this.closeAndWait(listener));
    }
    await Promise.all(closing);

    const cleanup = this.spool.reconcileManagedCloudIdentities(
      configurations.map((configuration) => ({
        tenantId: configuration.tenantId,
        collectorId: configuration.collectorId
      })),
      {
        tenantId: this.options.baseTenantId,
        collectorId: this.options.baseCollectorId
      }
    );
    if (cleanup.identitiesRemoved > 0) {
      console.info(JSON.stringify({
        level: 'info',
        component: 'managed-cloud-registry',
        message: 'Filas locais de coletores Cloud removidos foram descartadas',
        ...cleanup
      }));
    }

    for (const configuration of configurations) {
      const existing = this.listeners.get(configuration.collectorId);
      const devices = new Map(configuration.devices.map((device) => [device.exporterIp, device]));
      if (existing) {
        existing.configuration = configuration;
        existing.devices = devices;
        continue;
      }
      const active: ActiveCollector = {
        netflowSocket: this.socketFactory('udp4'),
        syslogSocket: this.socketFactory('udp4'),
        configuration,
        devices
      };
      this.configureSocket(active, active.netflowSocket, 'netflow_v9', configuration.netflowPort);
      this.configureSocket(active, active.syslogSocket, 'syslog', configuration.syslogPort);
      this.listeners.set(configuration.collectorId, active);
    }
  }

  private configureSocket(
    active: ActiveCollector,
    socket: dgram.Socket,
    sourceType: ManagedSourceType,
    port: number
  ): void {
    const { configuration } = active;
    socket.on('message', (payload, remote) => {
      try {
        this.persist(active, payload, remote, sourceType);
      } catch (error) {
        console.error(JSON.stringify({
          level: 'error', component: 'managed-cloud-listener', collectorId: configuration.collectorId,
          sourceType, exporter: remote.address, error: error instanceof Error ? error.message : String(error)
        }));
      }
    });
    socket.on('error', (error) => {
      console.error(JSON.stringify({
        level: 'error', component: 'managed-cloud-listener', collectorId: configuration.collectorId,
        sourceType, port, error: error.message
      }));
      const current = this.listeners.get(configuration.collectorId);
      if (current && (current.netflowSocket === socket || current.syslogSocket === socket)) {
        this.close(current);
        this.listeners.delete(configuration.collectorId);
      } else {
        this.safeClose(socket);
      }
    });
    socket.bind(port, this.options.host, () => {
      console.info(JSON.stringify({
        level: 'info', component: 'managed-cloud-listener', collectorId: configuration.collectorId,
        tenantId: configuration.tenantId, sourceType, host: this.options.host, port
      }));
    });
  }

  private close(active: ActiveCollector): void {
    this.safeClose(active.netflowSocket);
    this.safeClose(active.syslogSocket);
  }

  private async closeAndWait(active: ActiveCollector): Promise<void> {
    await Promise.all([
      this.closeSocketAndWait(active.netflowSocket),
      this.closeSocketAndWait(active.syslogSocket)
    ]);
  }

  private closeSocketAndWait(socket: dgram.Socket): Promise<void> {
    return new Promise((resolve) => {
      try {
        socket.close(resolve);
      } catch {
        // O socket pode ainda não ter concluído o bind ou já ter sido encerrado pelo sistema.
        resolve();
      }
    });
  }

  private safeClose(socket: dgram.Socket): void {
    try {
      socket.close();
    } catch {
      // O socket pode ainda não ter concluído o bind ou já ter sido encerrado pelo sistema.
    }
  }

  private persist(
    active: ActiveCollector,
    payload: Buffer,
    remote: dgram.RemoteInfo,
    sourceType: ManagedSourceType
  ): void {
    const blocked = active.configuration.firewall.mode === 'enforce'
      && !active.configuration.firewall.allowedSources.some((cidr) => ipv4MatchesCidr(remote.address, cidr));
    this.observeFirewallSource(active.configuration, remote.address, sourceType, blocked);
    if (blocked) return;
    if (sourceType === 'syslog' && isA10IgnoredProtocolEvent(payload, this.options.ignoredA10Protocols)) return;
    const receivedAt = new Date().toISOString();
    const rawId = newId();
    const reportedExporterIp = sourceType === 'syslog' ? a10SyslogReportedIp(payload) : null;
    const exporterIp = reportedExporterIp ?? remote.address;
    const healthProbe = sourceType === 'syslog' && isA10HealthProbe(payload);
    const configured = healthProbe ? undefined : active.devices.get(exporterIp);
    const vendor = configured?.vendor ?? (sourceType === 'netflow_v9' ? 'cisco' : 'a10');
    const context: ParseContext = {
      rawId,
      tenantId: active.configuration.tenantId,
      collectorId: active.configuration.collectorId,
      deviceId: configured?.deviceId ?? UNREGISTERED_DEVICE_ID,
      vendor,
      exporterIp,
      templateNamespace: active.configuration.collectorId,
      exporterPort: remote.port,
      transportIp: remote.address,
      receivedAt
    };
    const parsed = this.parsers[sourceType].parse(payload, context);
    const raw: RawRecord = {
      rawId,
      batchId: null,
      tenantId: context.tenantId,
      collectorId: context.collectorId,
      deviceId: context.deviceId,
      vendor: context.vendor,
      sourceType,
      exporterIp,
      exporterPort: remote.port,
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
    this.spool.append(raw, parsed.events);
  }

  private observeFirewallSource(
    configuration: ManagedCloudCollectorConfiguration,
    sourceIp: string,
    sourceType: ManagedSourceType,
    blocked: boolean
  ): void {
    const now = new Date().toISOString();
    const key = `${configuration.collectorId}:${sourceIp}:${sourceType}`;
    const current = this.firewallObservations.get(key);
    if (current) {
      current.lastSeenAt = now;
      current.packetCount += 1;
      if (blocked) current.blockedPacketCount += 1;
      return;
    }
    this.firewallObservations.set(key, {
      tenantId: configuration.tenantId,
      collectorId: configuration.collectorId,
      sourceIp,
      sourceType,
      firstSeenAt: now,
      lastSeenAt: now,
      packetCount: 1,
      blockedPacketCount: blocked ? 1 : 0
    });
  }

  private mergeFirewallObservations(observations: Map<string, FirewallObservation>): void {
    for (const [key, observation] of observations) {
      const current = this.firewallObservations.get(key);
      if (!current) {
        this.firewallObservations.set(key, observation);
        continue;
      }
      current.firstSeenAt = Date.parse(observation.firstSeenAt) < Date.parse(current.firstSeenAt)
        ? observation.firstSeenAt : current.firstSeenAt;
      current.lastSeenAt = Date.parse(observation.lastSeenAt) > Date.parse(current.lastSeenAt)
        ? observation.lastSeenAt : current.lastSeenAt;
      current.packetCount += observation.packetCount;
      current.blockedPacketCount += observation.blockedPacketCount;
    }
  }
}
