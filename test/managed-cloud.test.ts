import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ManagedCloudCollectorManager } from '../src/collector/managed-cloud.js';
import { CollectorSpool } from '../src/collector/spool.js';
import type { ManagedCloudCollectorConfiguration } from '../src/domain/models.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

class FakeSocket extends EventEmitter {
  private port = 0;

  constructor(private readonly operations: string[]) {
    super();
  }

  bind(port: number, _host: string, callback: () => void): void {
    this.port = port;
    this.operations.push(`bind:${port}`);
    callback();
  }

  close(callback?: () => void): void {
    const port = this.port;
    setTimeout(() => {
      this.operations.push(`closed:${port}`);
      callback?.();
    }, 1);
  }
}

function configuration(
  tenantId: string,
  collectorId: string
): ManagedCloudCollectorConfiguration {
  return {
    tenantId,
    collectorId,
    name: 'Coletor Cloud',
    netflowPort: 30000,
    syslogPort: 30001,
    firewall: {
      mode: 'monitor',
      allowedSources: [],
      updatedAt: '2026-09-29T12:00:00.000Z'
    },
    devices: []
  };
}

describe('ManagedCloudCollectorManager', () => {
  it('fecha os listeners antigos antes de reutilizar as portas no novo coletor', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'argus-managed-cloud-'));
    directories.push(directory);
    const spool = new CollectorSpool(join(directory, 'spool.sqlite'));
    const operations: string[] = [];
    const socketFactory = (() => new FakeSocket(operations)) as unknown as typeof dgram.createSocket;
    const manager = new ManagedCloudCollectorManager(spool, {
      registryUrl: 'http://127.0.0.1/registry',
      token: 'test',
      version: '1.0.5',
      host: '0.0.0.0',
      heartbeatIntervalMs: 60_000,
      ignoredA10Protocols: [],
      baseTenantId: '30000000-0000-4000-8000-000000000001',
      baseCollectorId: '30000000-0000-4000-8000-000000000002'
    }, () => ({
      hostname: 'test', platform: 'test', uptimeSeconds: 1, cpuUsagePercent: 1,
      memoryTotalBytes: 1, memoryUsedBytes: 1, diskTotalBytes: 1, diskUsedBytes: 1
    }), socketFactory);
    const reconcile = (manager as unknown as {
      reconcile(configurations: ManagedCloudCollectorConfiguration[]): Promise<void>;
    }).reconcile.bind(manager);

    await reconcile([configuration(
      '30000000-0000-4000-8000-000000000101',
      '30000000-0000-4000-8000-000000000201'
    )]);
    operations.length = 0;
    await reconcile([configuration(
      '30000000-0000-4000-8000-000000000102',
      '30000000-0000-4000-8000-000000000202'
    )]);

    expect(operations).toEqual([
      'closed:30000',
      'closed:30001',
      'bind:30000',
      'bind:30001'
    ]);
    manager.stop();
    spool.close();
  });
});
