import Fastify from 'fastify';
import { generateKeyPairSync } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerBackupRoutes, startBackupProcessor } from '../src/api/backups.js';
import type { ClickHouseRepository } from '../src/api/clickhouse.js';
import type { AuthSession, PostgresRepository, TenantBackupJob } from '../src/api/postgres.js';
import { createEncryptedTarGz, encryptBackupFile } from '../src/core/backup-archive.js';
import {
  parseGoogleServiceAccount, pruneGoogleDriveBackups, testGoogleDriveFolder
} from '../src/core/google-drive-backup.js';

const execFileAsync = promisify(execFile);
const cookie = `argus_session=${'b'.repeat(32)}`;
const tenantId = '20000000-0000-4000-8000-000000000042';
const session: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000040',
  id: '10000000-0000-4000-8000-000000000041', tenantId, tenantName: 'Cliente A',
  tenantTimezone: 'America/Sao_Paulo', homeTenantId: tenantId, homeTenantName: 'Cliente A',
  homeTenantTimezone: 'America/Sao_Paulo', name: 'Administrador', email: 'admin@example.com',
  role: 'admin', platformAdmin: false, context: 'tenant', expiresAt: '2026-12-01T00:00:00.000Z'
};
const platformSession: AuthSession = {
  ...session,
  platformAdmin: true,
  platformOwner: true
};

function job(overrides: Partial<TenantBackupJob> = {}): TenantBackupJob {
  return {
    id: '30000000-0000-4000-8000-000000000043', tenantId, tenantName: 'Cliente A',
    requestedByUserId: session.id, status: 'pending', sendToGoogleDrive: false,
    archiveName: null, byteCount: 0, sha256: null, googleDriveFileId: null,
    errorMessage: '', requestedAt: '2026-09-29T12:00:00.000Z', startedAt: null,
    completedAt: null, expiresAt: null, ...overrides
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('backup criptografado', () => {
  it('é recuperado somente com a frase correta pela ferramenta distribuída', async () => {
    const root = await mkdtemp(join(tmpdir(), 'logvault-backup-test-'));
    try {
      const source = join(root, 'source.tar.gz');
      const encrypted = join(root, 'source.tar.gz.lvault');
      const restored = join(root, 'restored.tar.gz');
      const phrase = join(root, 'phrase.txt');
      const content = Buffer.concat([Buffer.from('conteúdo do ponto de restauração', 'utf8'), Buffer.from([0, 1, 2])]);
      await writeFile(source, content, { mode: 0o600 });
      await writeFile(phrase, 'uma-frase-de-recuperacao-com-mais-de-vinte-caracteres\n', { mode: 0o600 });
      await encryptBackupFile({
        sourcePath: source, outputPath: encrypted,
        passphrase: 'uma-frase-de-recuperacao-com-mais-de-vinte-caracteres'
      });
      await execFileAsync(process.execPath, ['scripts/decrypt-backup.mjs', encrypted, restored, phrase], { cwd: process.cwd() });
      expect(await readFile(restored)).toEqual(content);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('gera um pacote lógico isolado com manifesto e checksums', async () => {
    const root = await mkdtemp(join(tmpdir(), 'logvault-tenant-package-test-'));
    const app = Fastify();
    let claimed = false;
    let completed: ((value: { archiveName: string; byteCount: number }) => void) | undefined;
    const completion = new Promise<{ archiveName: string; byteCount: number }>((resolve) => { completed = resolve; });
    const repository = {
      recoverInterruptedTenantBackups: async () => undefined,
      claimNextTenantBackup: async () => claimed ? null : (claimed = true, job({ status: 'pending' })),
      exportTenantSnapshot: async (requestedTenantId: string) => ({ tenant: { id: requestedTenantId }, users: [] }),
      completeTenantBackup: async (result: { archiveName: string; byteCount: number }) => completed?.(result),
      failTenantBackup: async (_jobId: string, error: string) => { throw new Error(error); },
      getPlatformBackupDestination: async () => null
    } as unknown as PostgresRepository;
    const clickhouse = {
      exportTenantTable: async function* (_table: string, requestedTenantId: string) {
        yield `${JSON.stringify({ tenant_id: requestedTenantId, value: 1 })}\n`;
      }
    } as unknown as ClickHouseRepository;
    try {
      await startBackupProcessor(app, {
        postgres: repository, clickhouse, backupRoot: join(root, 'full'),
        tenantBackupRoot: join(root, 'tenant'), stagingRoot: join(root, 'staging'), encryptionKey: 'a'.repeat(64)
      });
      const result = await Promise.race([
        completion,
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]);
      expect(result.archiveName).toMatch(/^logvault-tenant-.+\.tar\.gz$/);
      expect(result.byteCount).toBeGreaterThan(0);
      const { stdout } = await execFileAsync('tar', ['-tzf', join(root, 'tenant', 'archives', result.archiveName)]);
      expect(stdout.trim().split('\n').sort()).toEqual([
        'CHECKSUMS.sha256', 'clickhouse-cgnat-events.jsonl',
        'clickhouse-ingest-batch-receipts.jsonl', 'clickhouse-ingest-raw.jsonl', 'clickhouse-server-metrics.jsonl',
        'manifest.json', 'postgres.json'
      ]);
    } finally {
      await app.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('compacta e criptografa o backup completo em um único fluxo', async () => {
    const root = await mkdtemp(join(tmpdir(), 'logvault-full-stream-test-'));
    try {
      const sourceRoot = join(root, 'runs');
      const runRoot = join(sourceRoot, '20260929T120000Z');
      await mkdir(runRoot, { recursive: true });
      await writeFile(join(runRoot, 'COMPLETE'), 'ok\n');
      const encrypted = join(root, 'platform.tar.gz.lvault');
      const restored = join(root, 'platform.tar.gz');
      const phrase = join(root, 'phrase.txt');
      const passphrase = 'frase-segura-para-backup-completo-streaming';
      await writeFile(phrase, `${passphrase}\n`, { mode: 0o600 });
      await createEncryptedTarGz({
        sourceDirectory: sourceRoot, entries: ['20260929T120000Z'], outputPath: encrypted, passphrase
      });
      await execFileAsync(process.execPath, ['scripts/decrypt-backup.mjs', encrypted, restored, phrase], { cwd: process.cwd() });
      const { stdout } = await execFileAsync('tar', ['-tzf', restored]);
      expect(stdout).toContain('20260929T120000Z/COMPLETE');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe('Google Drive para backup', () => {
  const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
    type: 'pkcs8', format: 'pem'
  }).toString();
  const credentials = parseGoogleServiceAccount(JSON.stringify({
    client_email: 'backup@project.iam.gserviceaccount.com', private_key: privateKey,
    token_uri: 'https://oauth2.googleapis.com/token'
  }));

  it('valida um Shared Drive criando e removendo um arquivo de prova', async () => {
    const requests: Array<{ url: string; method: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push({ url, method });
      if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'token' });
      if (method === 'GET') return Response.json({
        id: 'shared-folder-123', name: 'Backups', driveId: 'shared-drive-123',
        mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true }
      });
      if (method === 'POST') return Response.json({ id: 'probe-file-123' });
      return new Response(null, { status: 204 });
    }));
    await expect(testGoogleDriveFolder({ credentials, folderId: 'shared-folder-123' }))
      .resolves.toEqual({ id: 'shared-folder-123', name: 'Backups' });
    expect(requests.map(({ method }) => method)).toEqual(['POST', 'GET', 'POST', 'DELETE']);
  });

  it('remove somente arquivos LogVault vencidos do escopo solicitado', async () => {
    const methods: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      methods.push(method);
      if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'token' });
      if (method === 'GET') return Response.json({ files: [
        { id: 'old-backup-123', createdTime: '2025-01-01T00:00:00.000Z' },
        { id: 'new-backup-123', createdTime: new Date().toISOString() }
      ] });
      return new Response(null, { status: 204 });
    }));
    await expect(pruneGoogleDriveBackups({
      credentials, folderId: 'shared-folder-123', scope: 'tenant', retentionDays: 30
    })).resolves.toBe(1);
    expect(methods).toEqual(['POST', 'GET', 'DELETE']);
  });
});

describe('backups de cliente administrados pela plataforma', () => {
  it('permite ao administrador da plataforma operar exclusivamente o tenant ativo', async () => {
    const tenantIds: string[] = [];
    const repository = {
      findActiveSession: async () => platformSession,
      listTenantBackupJobs: async (requestedTenantId: string) => { tenantIds.push(requestedTenantId); return [job()]; },
      getPlatformBackupDestination: async () => null,
      createTenantBackupJob: async (input: { tenantId: string }) => { tenantIds.push(input.tenantId); return job(); }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerBackupRoutes(app, { postgres: repository, encryptionKey: 'a'.repeat(64), tenantBackupRoot: '/tmp', trigger: () => undefined });
    const listed = await app.inject({ method: 'GET', url: '/v1/backups', headers: { cookie } });
    const created = await app.inject({
      method: 'POST', url: '/v1/backups', headers: { cookie, 'content-type': 'application/json' },
      payload: { sendToGoogleDrive: false, tenantId: '90000000-0000-4000-8000-000000000099' }
    });
    expect(listed.statusCode).toBe(200);
    expect(created.statusCode).toBe(202);
    expect(tenantIds).toEqual([tenantId, tenantId]);
    await app.close();
  });

  it('não expõe listagem, geração ou download ao administrador do cliente', async () => {
    const repository = {
      findActiveSession: async () => session,
      getTenantBackupJob: async (requestedTenantId: string) => {
        expect(requestedTenantId).toBe(tenantId);
        return null;
      }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerBackupRoutes(app, { postgres: repository, encryptionKey: 'a'.repeat(64), tenantBackupRoot: '/tmp', trigger: () => undefined });
    const listResponse = await app.inject({ method: 'GET', url: '/v1/backups', headers: { cookie } });
    const createResponse = await app.inject({ method: 'POST', url: '/v1/backups', headers: { cookie }, payload: {} });
    const downloadResponse = await app.inject({
      method: 'GET', url: '/v1/backups/30000000-0000-4000-8000-000000000099/download', headers: { cookie }
    });
    expect(listResponse.statusCode).toBe(403);
    expect(createResponse.statusCode).toBe(403);
    expect(downloadResponse.statusCode).toBe(403);
    await app.close();
  });

  it('consulta o job de download sempre dentro do tenant autenticado', async () => {
    let requestedTenantId = '';
    const repository = {
      findActiveSession: async () => platformSession,
      getTenantBackupJob: async (candidateTenantId: string) => { requestedTenantId = candidateTenantId; return null; }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerBackupRoutes(app, { postgres: repository, encryptionKey: 'a'.repeat(64), tenantBackupRoot: '/tmp', trigger: () => undefined });
    const response = await app.inject({
      method: 'GET', url: '/v1/backups/30000000-0000-4000-8000-000000000099/download', headers: { cookie }
    });
    expect(response.statusCode).toBe(404);
    expect(requestedTenantId).toBe(tenantId);
    await app.close();
  });
});
