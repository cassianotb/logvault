import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const installer = resolve('scripts/install-argus.sh');
const strongPassword = 'SenhaForte-2026!';

function valuesOf(contents: string): Map<string, string> {
  return new Map(contents
    .split('\n')
    .filter((line) => /^ARGUS_[A-Z0-9_]+=/.test(line))
    .map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    }));
}

async function passwordFile(root: string, password = strongPassword): Promise<string> {
  const path = join(root, 'admin-password');
  await writeFile(path, `${password}\n`, { mode: 0o600 });
  return path;
}

describe('instalador do Sistema LogVault', () => {
  it('gera um .env completo sem revelar credenciais na saída', async () => {
    const root = await mkdtemp(join(tmpdir(), 'argus-installer-'));
    const envFile = join(root, '.env');
    const secretFile = await passwordFile(root);
    const result = spawnSync('bash', [
      installer, 'configure',
      '--admin-name', 'Administrador LogVault',
      '--admin-email', 'admin@example.com',
      '--admin-password-file', secretFile,
      '--data-root', 'docker',
      '--domain', 'logs.example.com',
      '--acme-email', 'infra@example.com',
      '--tls-challenge', 'dns-01',
      '--public-url', 'https://logs.example.com:5500',
      '--server-name', 'VM principal · DC-A',
      '--env-file', envFile,
      '--no-apply'
    ], { encoding: 'utf8' });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain(strongPassword);
    expect(result.stdout).not.toMatch(/[a-f0-9]{64}/);

    const contents = await readFile(envFile, 'utf8');
    const env = valuesOf(contents);
    expect(env.get('ARGUS_ENV')).toBe('production');
    expect(env.get('ARGUS_DATA_ROOT')).toBe('docker');
    expect(env.get('ARGUS_POSTGRES_DATA_PATH')).toBe('postgres-data');
    expect(env.get('ARGUS_CLICKHOUSE_DATA_PATH')).toBe('clickhouse-data');
    expect(env.get('ARGUS_COLLECTOR_DATA_PATH')).toBe('collector-data');
    expect(env.get('ARGUS_BACKUP_DATA_PATH')).toBe('backup-data');
    expect(env.get('ARGUS_BOOTSTRAP_ADMIN_NAME')).toBe('Administrador LogVault');
    expect(env.get('ARGUS_BOOTSTRAP_ADMIN_EMAIL')).toBe('admin@example.com');
    expect(env.get('ARGUS_BOOTSTRAP_ADMIN_PASSWORD')).toBe(strongPassword);
    expect(env.get('ARGUS_TLS_DOMAIN')).toBe('logs.example.com');
    expect(env.get('ARGUS_TLS_EMAIL')).toBe('infra@example.com');
    expect(env.get('ARGUS_TLS_CHALLENGE')).toBe('dns-01');
    expect(env.get('ARGUS_PUBLIC_URL')).toBe('https://logs.example.com:5500');
    expect(env.get('ARGUS_COOKIE_SECURE')).toBe('true');
    expect(env.get('ARGUS_DR_PANEL_HOST')).toBe('logs.example.com');
    expect(env.get('ARGUS_DR_INGEST_HOST')).toBe('logs.example.com');
    expect(env.get('ARGUS_DR_CONTROL_HOST')).toBe('logs.example.com');
    expect(env.get('ARGUS_DR_DNS_PROVIDER')).toBe('manual');
    expect(env.get('ARGUS_DR_DNS_TTL_SECONDS')).toBe('300');
    expect(env.get('ARGUS_DR_POSTGRES_REPLICATION_PASSWORD')).toMatch(/^[a-f0-9]{64}$/);
    expect(env.get('ARGUS_DR_REPLICATION_CIDR')).toBe('10.0.0.0/8');
    expect(env.get('ARGUS_POSTGRES_PASSWORD')).toMatch(/^[a-f0-9]{48}$/);
    expect(env.get('ARGUS_CLICKHOUSE_PASSWORD')).toMatch(/^[a-f0-9]{48}$/);
    expect(env.get('ARGUS_SYNC_TOKEN')).toMatch(/^[a-f0-9]{64}$/);
    expect(env.get('ARGUS_ALERT_ENCRYPTION_KEY')).toMatch(/^[a-f0-9]{64}$/);
    expect(env.get('ARGUS_POSTGRES_URL')).toBe(
      `postgres://argus:${env.get('ARGUS_POSTGRES_PASSWORD')}@postgres:5432/argus`
    );
    for (const key of ['ARGUS_TENANT_ID', 'ARGUS_COLLECTOR_ID', 'ARGUS_DEVICE_ID']) {
      expect(env.get(key)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(env.get(key)).not.toBe('00000000-0000-0000-0000-000000000001');
    }
    expect((await stat(envFile)).mode & 0o777).toBe(0o600);
  });

  it('recusa uma senha administrativa fraca antes de criar o ambiente', async () => {
    const root = await mkdtemp(join(tmpdir(), 'argus-installer-weak-'));
    const envFile = join(root, '.env');
    const secretFile = await passwordFile(root, 'senha-fraca');
    const result = spawnSync('bash', [
      installer, 'configure',
      '--admin-email', 'admin@example.com',
      '--admin-password-file', secretFile,
      '--data-root', 'docker',
      '--env-file', envFile,
      '--no-apply'
    ], { encoding: 'utf8' });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('senha inicial fraca');
  });

  it('mapeia um diretório persistente e preserva segredos ao reconfigurar', async () => {
    const root = await mkdtemp(join(tmpdir(), 'argus-installer-storage-'));
    const envFile = join(root, '.env');
    const dataRoot = join(root, 'logvault-data');
    const secretFile = await passwordFile(root);
    const first = spawnSync('bash', [
      installer, 'configure',
      '--admin-email', 'admin@example.com',
      '--admin-password-file', secretFile,
      '--data-root', dataRoot,
      '--backup-retention-days', '30',
      '--timezone', 'America/Fortaleza',
      '--env-file', envFile,
      '--no-apply'
    ], { encoding: 'utf8' });
    expect(first.status, first.stderr).toBe(0);

    const original = valuesOf(await readFile(envFile, 'utf8'));
    expect(original.get('ARGUS_POSTGRES_DATA_PATH')).toBe(join(dataRoot, 'postgres'));
    expect(original.get('ARGUS_CLICKHOUSE_DATA_PATH')).toBe(join(dataRoot, 'clickhouse'));
    expect(original.get('ARGUS_COLLECTOR_DATA_PATH')).toBe(join(dataRoot, 'collector'));
    expect(original.get('ARGUS_BACKUP_DATA_PATH')).toBe(join(dataRoot, 'backups'));
    expect(original.get('ARGUS_BACKUP_RETENTION_DAYS')).toBe('30');
    expect(original.get('ARGUS_DEVICE_TIMEZONE')).toBe('America/Fortaleza');

    const second = spawnSync('bash', [
      installer, 'configure',
      '--admin-email', 'novo-admin@example.com',
      '--env-file', envFile,
      '--no-apply'
    ], { encoding: 'utf8' });
    expect(second.status, second.stderr).toBe(0);

    const reconfigured = valuesOf(await readFile(envFile, 'utf8'));
    expect(reconfigured.get('ARGUS_BOOTSTRAP_ADMIN_EMAIL')).toBe('novo-admin@example.com');
    for (const key of [
      'ARGUS_POSTGRES_PASSWORD', 'ARGUS_CLICKHOUSE_PASSWORD', 'ARGUS_SYNC_TOKEN',
      'ARGUS_ALERT_ENCRYPTION_KEY', 'ARGUS_TENANT_ID', 'ARGUS_COLLECTOR_ID',
      'ARGUS_DEVICE_ID', 'ARGUS_BOOTSTRAP_ADMIN_PASSWORD'
    ]) {
      expect(reconfigured.get(key), key).toBe(original.get(key));
    }
    expect(await readFile(`${envFile}.bak`, 'utf8')).toContain('ARGUS_BOOTSTRAP_ADMIN_EMAIL=admin@example.com');
  });
});
