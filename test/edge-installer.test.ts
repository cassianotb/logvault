import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const validToken = '8f117c3b7e89445aa98615c9d7681c5ad951dc21b8a14922';
const validConfig = [
  'ARGUS_ENV=production',
  'ARGUS_TENANT_ID=4db94436-f25f-4d74-b20e-62be11b02730',
  'ARGUS_COLLECTOR_ID=2e805870-006d-4f37-97fa-7fbb832229c8',
  `ARGUS_SYNC_TOKEN=${validToken}`,
  'ARGUS_SYNC_URL=https://logs.example.com/api/v1/ingest/batches',
  'ARGUS_HEARTBEAT_URL=https://logs.example.com/api/v1/ingest/heartbeat',
  'ARGUS_SPOOL_PATH=/var/lib/argus/spool.sqlite',
  'ARGUS_NETFLOW_PORT=2055',
  'ARGUS_SYSLOG_PORT=5140',
  'ARGUS_DEVICES_JSON=[]'
].join('\n');

let testRoot = '';
let installer = '';

beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'logvault-edge-installer-'));
  installer = join(testRoot, 'scripts', 'install-edge.sh');
  await mkdir(dirname(installer), { recursive: true });
  await copyFile(resolve('scripts/install-edge.sh'), installer);
});

afterEach(async () => {
  if (testRoot) await rm(testRoot, { recursive: true, force: true });
});

function run(args: string[]) {
  return spawnSync('sh', [installer, ...args], { encoding: 'utf8' });
}

describe('configuração segura do coletor pelo instalador', () => {
  it('importa, valida e protege a configuração sem imprimir o token', async () => {
    const source = join(testRoot, 'collector.env');
    await writeFile(source, `${validConfig}\n`, { mode: 0o600 });

    const result = run(['--config-file', source, '--prepare-only']);
    expect(result.status, result.stderr).toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(validToken);
    expect(result.stdout).toContain('validada e salva com segurança');

    const saved = join(testRoot, '.env.edge');
    expect(await readFile(saved, 'utf8')).toContain(`ARGUS_SYNC_TOKEN=${validToken}`);
    expect((await stat(saved)).mode & 0o777).toBe(0o600);
  });

  it('normaliza arquivos copiados com quebra de linha do Windows', async () => {
    const source = join(testRoot, 'collector-windows.env');
    await writeFile(source, `${validConfig.replaceAll('\n', '\r\n')}\r\n`, { mode: 0o600 });

    const result = run(['--config-file', source, '--prepare-only']);
    expect(result.status, result.stderr).toBe(0);
    expect(await readFile(join(testRoot, '.env.edge'), 'utf8')).not.toContain('\r');
  });

  it('recusa valores de exemplo e não persiste o token inválido', async () => {
    const source = join(testRoot, 'invalid.env');
    const invalid = validConfig.replace(validToken, 'substitua-pela-chave-individual-do-coletor');
    await writeFile(source, `${invalid}\n`, { mode: 0o600 });

    const result = run(['--config-file', source, '--prepare-only']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('valores de exemplo');
    await expect(stat(join(testRoot, '.env.edge'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(`${result.stdout}${result.stderr}`).not.toContain('substitua-pela-chave-individual-do-coletor');
  });

  it('recusa variáveis obrigatórias duplicadas', async () => {
    const source = join(testRoot, 'duplicated.env');
    await writeFile(source, `${validConfig}\nARGUS_SYNC_TOKEN=outra-chave\n`, { mode: 0o600 });

    const result = run(['--config-file', source, '--prepare-only']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('exatamente uma linha ARGUS_SYNC_TOKEN=');
  });
});
