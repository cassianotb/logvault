import { readFileSync, statfsSync } from 'node:fs';
import os from 'node:os';

export interface HostMetrics {
  hostname: string;
  platform: string;
  uptimeSeconds: number;
  cpuUsagePercent: number | null;
  memoryTotalBytes: number;
  memoryUsedBytes: number;
  diskTotalBytes: number | null;
  diskUsedBytes: number | null;
  networkReceivedBytesPerSecond?: number | null | undefined;
  networkTransmittedBytesPerSecond?: number | null | undefined;
}

interface CpuSnapshot {
  idle: number;
  total: number;
}

interface NetworkSnapshot {
  receivedBytes: number;
  transmittedBytes: number;
  sampledAt: number;
}

function cpuSnapshot(): CpuSnapshot {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
  }
  return { idle, total };
}

function diskUsage(path: string): { total: number | null; used: number | null } {
  try {
    const statistics = statfsSync(path, { bigint: true });
    const total = statistics.blocks * statistics.bsize;
    const available = statistics.bavail * statistics.bsize;
    return { total: Number(total), used: Number(total - available) };
  } catch {
    return { total: null, used: null };
  }
}

function networkSnapshot(): NetworkSnapshot | null {
  try {
    let receivedBytes = 0;
    let transmittedBytes = 0;
    for (const line of readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2)) {
      const separator = line.indexOf(':');
      if (separator < 0) continue;
      const interfaceName = line.slice(0, separator).trim();
      if (!interfaceName || interfaceName === 'lo') continue;
      const fields = line.slice(separator + 1).trim().split(/\s+/);
      const received = Number(fields[0]);
      const transmitted = Number(fields[8]);
      if (Number.isFinite(received)) receivedBytes += received;
      if (Number.isFinite(transmitted)) transmittedBytes += transmitted;
    }
    return { receivedBytes, transmittedBytes, sampledAt: Date.now() };
  } catch {
    return null;
  }
}

export class HostMetricsSampler {
  private previousCpu = cpuSnapshot();
  private previousNetwork = networkSnapshot();

  constructor(private readonly diskPath: string) {}

  sample(): HostMetrics {
    const currentCpu = cpuSnapshot();
    const totalDelta = currentCpu.total - this.previousCpu.total;
    const idleDelta = currentCpu.idle - this.previousCpu.idle;
    this.previousCpu = currentCpu;
    const cpuUsagePercent = totalDelta > 0
      ? Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100))
      : null;
    const memoryTotalBytes = os.totalmem();
    const memoryUsedBytes = Math.max(0, memoryTotalBytes - os.freemem());
    const disk = diskUsage(this.diskPath);
    const currentNetwork = networkSnapshot();
    let networkReceivedBytesPerSecond: number | null = null;
    let networkTransmittedBytesPerSecond: number | null = null;
    if (currentNetwork && this.previousNetwork) {
      const elapsedSeconds = (currentNetwork.sampledAt - this.previousNetwork.sampledAt) / 1000;
      if (elapsedSeconds > 0) {
        networkReceivedBytesPerSecond = Math.max(0, Math.round(
          (currentNetwork.receivedBytes - this.previousNetwork.receivedBytes) / elapsedSeconds
        ));
        networkTransmittedBytesPerSecond = Math.max(0, Math.round(
          (currentNetwork.transmittedBytes - this.previousNetwork.transmittedBytes) / elapsedSeconds
        ));
      }
    }
    this.previousNetwork = currentNetwork;
    return {
      hostname: os.hostname().slice(0, 255),
      platform: `${os.platform()} ${os.release()}`.slice(0, 255),
      uptimeSeconds: Math.max(0, Math.floor(os.uptime())),
      cpuUsagePercent: cpuUsagePercent === null ? null : Math.round(cpuUsagePercent * 100) / 100,
      memoryTotalBytes,
      memoryUsedBytes,
      diskTotalBytes: disk.total,
      diskUsedBytes: disk.used,
      networkReceivedBytesPerSecond,
      networkTransmittedBytesPerSecond
    };
  }
}
