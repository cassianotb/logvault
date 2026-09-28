import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
let testRoot = '';
let packagePath = '';

describe('instalador seguro do DC-B', () => {
  beforeAll(async () => {
    testRoot = await mkdtemp(join(tmpdir(), 'argus-dcb-installer-'));
    packagePath = join(testRoot, 'package');
  });

  afterAll(async () => {
    if (testRoot) await rm(testRoot, { recursive: true, force: true });
  });

  it('gera inventário e pacote protegido sem imprimir segredos', async () => {
    const { stdout } = await execFileAsync('bash', [
      'scripts/install-dc-b.sh', 'prepare', '--site-b-host', 'dc-b.internal',
      '--site-a-host', 'dc-a.internal', '--panel-host', 'logvault.example.test',
      '--ingest-host', 'ingest.example.test', '--dr-control-host', 'dr.example.test',
      '--dns-provider', 'manual', '--dns-ttl', '120',
      '--site-a-name', 'Data Center A', '--site-b-name', 'Data Center B',
      '--output', packagePath, '--tls', 'false', '--clickhouse-port', '8123', '--api-port', '8080',
      '--postgres-path', testRoot, '--clickhouse-path', testRoot,
      '--minimum-vcpu', '1', '--minimum-memory-gb', '1', '--minimum-system-disk-gb', '1',
      '--minimum-postgres-disk-gb', '1', '--minimum-clickhouse-disk-gb', '1', '--allow-unresolved-hosts'
    ]);
    const inventory = JSON.parse(await readFile(join(packagePath, 'inventory.json'), 'utf8')) as {
      result: string;
      network: { primaryIpv4: string; interface: string; defaultGateway: string };
      storage: { postgres: { path: string; source: string }; clickhouse: { path: string; source: string } };
    };
    const enrollmentPayload = JSON.parse(await readFile(join(packagePath, 'enrollment-payload.json'), 'utf8')) as {
      inventory: { result: string }; configuration: { siteAName: string; siteBName: string; standbyApiUrl: string };
      routing: { panelHost: string; ingestHost: string; drControlHost: string; dnsTtlSeconds: number };
    };
    const registration = await readFile(join(packagePath, 'registration.env'), 'utf8');
    const clickhousePassword = registration.match(/^ARGUS_DR_CLICKHOUSE_STANDBY_PASSWORD=(.+)$/m)?.[1];
    expect(inventory.result).toBe('approved');
    expect(inventory.network).toHaveProperty('primaryIpv4');
    expect(inventory.storage.postgres.path).toBe(testRoot);
    expect(inventory.storage.clickhouse.path).toBe(testRoot);
    expect(enrollmentPayload).toMatchObject({
      inventory: { result: 'approved' },
      configuration: { siteAName: 'Data Center A', siteBName: 'Data Center B', standbyApiUrl: 'http://dc-b.internal:8080' },
      routing: { panelHost: 'logvault.example.test', ingestHost: 'ingest.example.test', drControlHost: 'dr.example.test', dnsTtlSeconds: 120 }
    });
    expect(stdout).toContain('As credenciais não foram exibidas');
    expect(clickhousePassword).toBeTruthy();
    expect(stdout).not.toContain(clickhousePassword);
    expect((await stat(packagePath)).mode & 0o777).toBe(0o700);
    expect((await stat(join(packagePath, 'registration.env'))).mode & 0o777).toBe(0o600);
  });

  it('recusa sobrescrever o pacote sem confirmação explícita', async () => {
    await expect(execFileAsync('bash', [
      'scripts/install-dc-b.sh', 'prepare', '--site-b-host', 'dc-b.internal',
      '--site-a-host', 'dc-a.internal', '--panel-host', 'logvault.example.test',
      '--ingest-host', 'ingest.example.test', '--dr-control-host', 'dr.example.test', '--output', packagePath,
      '--minimum-vcpu', '1', '--minimum-memory-gb', '1', '--minimum-system-disk-gb', '1',
      '--minimum-postgres-disk-gb', '1', '--minimum-clickhouse-disk-gb', '1', '--allow-unresolved-hosts'
    ])).rejects.toMatchObject({ code: 2 });
  });

  it('detecta o IP de saída e os filesystems sem perguntar dados locais', async () => {
    const automaticPackage = join(testRoot, 'automatic-package');
    const fakeBin = join(testRoot, 'network-bin');
    await mkdir(fakeBin, { recursive: true });
    await writeFile(join(fakeBin, 'ip'), `#!/bin/sh
printf '%s\n' '192.0.2.1 via 10.20.0.1 dev ens18 src 10.20.0.25 uid 0'
`, { mode: 0o755 });
    await execFileAsync('bash', [
      'scripts/install-dc-b.sh', 'prepare',
      '--site-a-host', '10.10.0.10', '--site-b-host', '203.0.113.25', '--panel-host', 'logvault.example.test',
      '--ingest-host', 'ingest.example.test', '--dr-control-host', 'dr.example.test',
      '--output', automaticPackage,
      '--minimum-vcpu', '1', '--minimum-memory-gb', '1', '--minimum-system-disk-gb', '1',
      '--minimum-postgres-disk-gb', '1', '--minimum-clickhouse-disk-gb', '1'
    ], { env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` } });

    const inventory = JSON.parse(await readFile(join(automaticPackage, 'inventory.json'), 'utf8')) as {
      network: { primaryIpv4: string; interface: string; defaultGateway: string };
      storage: { postgres: { path: string }; clickhouse: { path: string } };
    };
    const payload = JSON.parse(await readFile(join(automaticPackage, 'enrollment-payload.json'), 'utf8')) as {
      routing: { siteBHost: string };
    };
    expect(inventory.network).toEqual({ primaryIpv4: '10.20.0.25', interface: 'ens18', defaultGateway: '10.20.0.1' });
    expect(inventory.storage.postgres.path).toBe('/var/lib/postgresql');
    expect(inventory.storage.clickhouse.path).toBe('/var/lib/clickhouse');
    expect(payload.routing.siteBHost).toBe('203.0.113.25');
  });

  it('oferece o fluxo install e lê o token sem colocá-lo na saída', async () => {
    const installPackage = join(testRoot, 'install-package');
    const token = 'A'.repeat(48);
    const tokenFile = join(testRoot, 'enrollment-token');
    const fakeBin = join(testRoot, 'fake-bin');
    await mkdir(fakeBin, { recursive: true });
    await writeFile(join(fakeBin, 'curl'), '#!/bin/sh\nexit 22\n', { mode: 0o755 });
    await writeFile(tokenFile, `${token}\n`, { mode: 0o600 });
    await expect(execFileAsync('bash', [
      'scripts/install-dc-b.sh', 'install', '--argus-url', 'http://127.0.0.1:9', '--allow-http',
      '--enrollment-token-file', tokenFile, '--site-b-host', 'dc-b.internal',
      '--site-a-host', 'dc-a.internal', '--panel-host', 'logvault.example.test',
      '--ingest-host', 'ingest.example.test', '--dr-control-host', 'dr.example.test',
      '--output', installPackage, '--tls', 'false', '--clickhouse-port', '8123', '--api-port', '8080',
      '--postgres-path', testRoot, '--clickhouse-path', testRoot,
      '--minimum-vcpu', '1', '--minimum-memory-gb', '1', '--minimum-system-disk-gb', '1',
      '--minimum-postgres-disk-gb', '1', '--minimum-clickhouse-disk-gb', '1', '--allow-unresolved-hosts', '--yes'
    ], { env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` } })).rejects.toMatchObject({
      code: 2,
      stdout: expect.not.stringContaining(token),
      stderr: expect.not.stringContaining(token)
    });
    expect(await readFile(join(installPackage, 'enrollment-payload.json'), 'utf8')).not.toContain(token);
  });

  it('liga o enrollment ao provisionamento real sem promover o standby', async () => {
    const script = await readFile('scripts/install-dc-b.sh', 'utf8');
    const enrollment = script.indexOf('VM registrada no Argus');
    const provision = script.indexOf('provision_dc_b;', enrollment);
    expect(provision).toBeGreaterThan(enrollment);
    expect(script).toContain('pg_is_in_recovery()');
    expect(script).toContain('up -d clickhouse-mirror');
    expect(script).toContain('API, painel, coletor e backup permanecem desligados');
    expect(script).not.toContain('pg_ctl -D "$PGDATA" promote');
  });
});
