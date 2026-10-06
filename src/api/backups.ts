import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, mkdir, readFile, readdir, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from './auth.js';
import { requirePlatformAccess } from './access-control.js';
import type { ClickHouseRepository } from './clickhouse.js';
import type { PostgresRepository, TenantBackupJob } from './postgres.js';
import { createTarGz, fileDigest } from '../core/backup-archive.js';
import { importPlatformBackup } from '../core/backup-import.js';

const MAX_PLATFORM_IMPORT_BYTES = 50 * 1024 * 1024 * 1024;

const jobParamsSchema = z.object({ jobId: z.string().uuid() });
const importStartSchema = z.object({
  fileName: z.string().trim().min(1).max(240).refine((value) => /(?:\.tar\.gz|\.lvault)$/i.test(value), 'formato inválido'),
  totalBytes: z.number().int().positive().max(MAX_PLATFORM_IMPORT_BYTES)
});
const importParamsSchema = z.object({ importId: z.string().uuid() });
const importCompleteSchema = z.object({ passphrase: z.string().max(256).default('') });

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ').slice(0, 2000);
}

async function writeTenantBackup(input: {
  job: TenantBackupJob; postgres: PostgresRepository; clickhouse: ClickHouseRepository;
  backupRoot: string;
}): Promise<{ archiveName: string; bytes: number; sha256: string }> {
  const jobRoot = join(input.backupRoot, 'work', input.job.id);
  const archiveRoot = join(input.backupRoot, 'archives');
  await rm(jobRoot, { recursive: true, force: true });
  await mkdir(jobRoot, { recursive: true, mode: 0o700 });
  await mkdir(archiveRoot, { recursive: true, mode: 0o700 });
  try {
    const postgresSnapshot = await input.postgres.exportTenantSnapshot(input.job.tenantId);
    const postgresPath = join(jobRoot, 'postgres.json');
    await writeFile(postgresPath, `${JSON.stringify(postgresSnapshot)}\n`, { mode: 0o600 });
    const clickhouseFiles: Array<{
      table: 'ingest_raw' | 'cgnat_events' | 'server_metrics' | 'ingest_batch_receipts'; file: string;
    }> = [
      { table: 'ingest_raw', file: 'clickhouse-ingest-raw.jsonl' },
      { table: 'cgnat_events', file: 'clickhouse-cgnat-events.jsonl' },
      { table: 'server_metrics', file: 'clickhouse-server-metrics.jsonl' },
      { table: 'ingest_batch_receipts', file: 'clickhouse-ingest-batch-receipts.jsonl' }
    ];
    const rowCounts: Record<string, number> = {};
    for (const item of clickhouseFiles) {
      let rows = 0;
      const source = async function* () {
        for await (const line of input.clickhouse.exportTenantTable(item.table, input.job.tenantId)) {
          rows += 1;
          yield line;
        }
      };
      await pipeline(Readable.from(source()), createWriteStream(join(jobRoot, item.file), { mode: 0o600 }));
      rowCounts[item.table] = rows;
    }
    const dataFiles = ['postgres.json', ...clickhouseFiles.map((item) => item.file)];
    const checksums: Record<string, { bytes: number; sha256: string }> = {};
    for (const file of dataFiles) checksums[file] = await fileDigest(join(jobRoot, file));
    const manifest = {
      format: 'logvault-tenant-backup', schemaVersion: 1, restoreMode: 'logical',
      jobId: input.job.id, tenantId: input.job.tenantId, tenantName: input.job.tenantName,
      createdAt: new Date().toISOString(),
      exclusions: ['password hashes', 'tokens and sessions', 'collector API keys', 'integration secrets', 'binary report and logo payloads'],
      clickhouseRows: rowCounts, files: checksums
    };
    await writeFile(join(jobRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    checksums['manifest.json'] = await fileDigest(join(jobRoot, 'manifest.json'));
    await writeFile(join(jobRoot, 'CHECKSUMS.sha256'), Object.entries(checksums)
      .map(([file, digest]) => `${digest.sha256}  ${file}`).join('\n') + '\n', { mode: 0o600 });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const archiveName = `logvault-tenant-${input.job.tenantId}-${stamp}-${input.job.id}.tar.gz`;
    const archivePath = join(archiveRoot, archiveName);
    await createTarGz({
      sourceDirectory: jobRoot,
      entries: [...dataFiles, 'manifest.json', 'CHECKSUMS.sha256'],
      outputPath: archivePath
    });
    const digest = await fileDigest(archivePath);
    return { archiveName, ...digest };
  } finally {
    await rm(jobRoot, { recursive: true, force: true });
  }
}

export function registerBackupRoutes(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository; tenantBackupRoot: string;
  backupRoot?: string; stagingRoot?: string;
  trigger: () => void;
}): void {
  const backupRoot = dependencies.backupRoot ?? '/var/lib/argus/backups';
  const stagingRoot = dependencies.stagingRoot ?? '/var/lib/argus/backup-staging';
  if (!app.hasContentTypeParser('application/octet-stream')) {
    app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 9 * 1024 * 1024 },
      (_request, body, done) => done(null, body));
  }
  const importDirectory = (importId: string) => join(stagingRoot, 'imports', importId);
  const readImportSession = async (importId: string): Promise<{
    actorUserId: string; fileName: string; totalBytes: number; createdAt: string;
  }> => JSON.parse(await readFile(join(importDirectory(importId), 'session.json'), 'utf8')) as {
    actorUserId: string; fileName: string; totalBytes: number; createdAt: string;
  };
  void (async () => {
    const root = join(stagingRoot, 'imports');
    const cutoff = Date.now() - 24 * 60 * 60_000;
    try {
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || !z.string().uuid().safeParse(entry.name).success) continue;
        const path = join(root, entry.name);
        if ((await stat(path)).mtimeMs < cutoff) await rm(path, { recursive: true, force: true });
      }
    } catch { /* a pasta será criada na primeira importação */ }
  })();
  app.post('/v1/platform/backups/imports', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (session.context !== 'platform') return reply.code(403).send({ error: 'platform_context_required' });
    if (!requirePlatformAccess(session, reply, 'system', 'manage')) return;
    const parsed = importStartSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_backup_import', details: parsed.error.flatten() });
    await mkdir(stagingRoot, { recursive: true, mode: 0o700 });
    const filesystem = await statfs(stagingRoot);
    if (filesystem.bavail * filesystem.bsize < parsed.data.totalBytes + 512 * 1024 * 1024) {
      return reply.code(507).send({ error: 'insufficient_backup_import_space' });
    }
    const importId = randomUUID();
    const root = importDirectory(importId);
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(join(root, 'session.json'), JSON.stringify({
      actorUserId: session.id, fileName: parsed.data.fileName,
      totalBytes: parsed.data.totalBytes, createdAt: new Date().toISOString()
    }), { mode: 0o600 });
    await writeFile(join(root, 'upload.bin'), Buffer.alloc(0), { mode: 0o600 });
    return reply.code(201).send({ importId, chunkBytes: 8 * 1024 * 1024 });
  });

  app.put('/v1/platform/backups/imports/:importId/chunk', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (session.context !== 'platform') return reply.code(403).send({ error: 'platform_context_required' });
    if (!requirePlatformAccess(session, reply, 'system', 'manage')) return;
    const params = importParamsSchema.safeParse(request.params);
    if (!params.success || !Buffer.isBuffer(request.body)) return reply.code(400).send({ error: 'invalid_backup_import_chunk' });
    const metadata = await readImportSession(params.data.importId).catch(() => null);
    if (!metadata || metadata.actorUserId !== session.id) return reply.code(404).send({ error: 'backup_import_not_found' });
    const uploadPath = join(importDirectory(params.data.importId), 'upload.bin');
    const currentBytes = (await stat(uploadPath)).size;
    const expectedOffset = Number(request.headers['x-upload-offset']);
    if (!Number.isSafeInteger(expectedOffset) || expectedOffset !== currentBytes
      || currentBytes + request.body.length > metadata.totalBytes) {
      return reply.code(409).send({ error: 'backup_import_offset_mismatch', receivedBytes: currentBytes });
    }
    await appendFile(uploadPath, request.body);
    return reply.send({ receivedBytes: currentBytes + request.body.length, totalBytes: metadata.totalBytes });
  });

  app.post('/v1/platform/backups/imports/:importId/complete', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (session.context !== 'platform') return reply.code(403).send({ error: 'platform_context_required' });
    if (!requirePlatformAccess(session, reply, 'system', 'manage')) return;
    const params = importParamsSchema.safeParse(request.params);
    const body = importCompleteSchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_backup_import' });
    const metadata = await readImportSession(params.data.importId).catch(() => null);
    if (!metadata || metadata.actorUserId !== session.id) return reply.code(404).send({ error: 'backup_import_not_found' });
    const uploadPath = join(importDirectory(params.data.importId), 'upload.bin');
    if ((await stat(uploadPath)).size !== metadata.totalBytes) return reply.code(409).send({ error: 'backup_import_incomplete' });
    try {
      const result = await importPlatformBackup({
        sourcePath: uploadPath, sourceName: metadata.fileName,
        passphrase: body.data.passphrase,
        workspaceRoot: join(importDirectory(params.data.importId), 'validation'), backupRoot
      });
      await dependencies.postgres.auditPlatformBackupImport({
        actorUserId: session.id,
        details: { source: 'local', backupIds: result.backupIds, imported: result.imported }
      });
      await rm(importDirectory(params.data.importId), { recursive: true, force: true });
      return reply.send(result);
    } catch (error) {
      return reply.code(422).send({ error: 'backup_import_validation_failed', message: safeError(error) });
    }
  });

  app.get('/v1/backups', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    if (!requirePlatformAccess(session, reply, 'system', 'view')) return;
    const jobs = await dependencies.postgres.listTenantBackupJobs(session.tenantId);
    return reply.send({ backups: jobs });
  });

  app.post('/v1/backups', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    if (!requirePlatformAccess(session, reply, 'system', 'manage')) return;
    const job = await dependencies.postgres.createTenantBackupJob({
      tenantId: session.tenantId, actorUserId: session.id
    });
    if (job === 'active_exists') return reply.code(409).send({ error: 'tenant_backup_already_running' });
    dependencies.trigger();
    return reply.code(202).send({ backup: job });
  });

  app.get('/v1/backups/:jobId/download', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    if (!requirePlatformAccess(session, reply, 'system', 'manage')) return;
    const params = jobParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_tenant_backup_id' });
    const job = await dependencies.postgres.getTenantBackupJob(session.tenantId, params.data.jobId);
    if (!job || job.status !== 'ready' || !job.archiveName) return reply.code(404).send({ error: 'tenant_backup_not_available' });
    if (job.expiresAt && Date.parse(job.expiresAt) <= Date.now()) return reply.code(410).send({ error: 'tenant_backup_expired' });
    const archiveName = basename(job.archiveName);
    if (archiveName !== job.archiveName || !/^logvault-tenant-[A-Za-z0-9._-]+\.tar\.gz$/.test(archiveName)) {
      return reply.code(409).send({ error: 'tenant_backup_invalid_path' });
    }
    const archivePath = join(dependencies.tenantBackupRoot, 'archives', archiveName);
    try { await stat(archivePath); } catch { return reply.code(404).send({ error: 'tenant_backup_file_missing' }); }
    await dependencies.postgres.auditBackupDownload({
      tenantId: session.tenantId, actorUserId: session.id, backupId: job.id, totalBytes: job.byteCount,
      ipAddress: request.ip || null, userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : '',
      action: 'tenant_backup_downloaded'
    });
    reply.header('content-type', 'application/gzip');
    reply.header('content-disposition', `attachment; filename="${archiveName}"`);
    reply.header('x-logvault-backup-sha256', job.sha256 ?? '');
    return reply.send(createReadStream(archivePath));
  });
}

export async function startBackupProcessor(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository; clickhouse: ClickHouseRepository;
  tenantBackupRoot: string;
}): Promise<() => void> {
  let running = false;
  let stopped = false;
  await dependencies.postgres.recoverInterruptedTenantBackups();
  const cleanupExpiredTenantArchives = async () => {
    const archiveRoot = join(dependencies.tenantBackupRoot, 'archives');
    let entries: string[];
    try { entries = await readdir(archiveRoot); } catch { return; }
    const cutoff = Date.now() - 7 * 86_400_000;
    await Promise.all(entries.filter((name) => /^logvault-tenant-[A-Za-z0-9._-]+\.tar\.gz$/.test(name)).map(async (name) => {
      const path = join(archiveRoot, name);
      try { if ((await stat(path)).mtimeMs < cutoff) await rm(path, { force: true }); } catch { /* próxima limpeza tenta novamente */ }
    }));
  };
  const processTenantQueue = async () => {
    if (running || stopped) return;
    running = true;
    try {
      while (!stopped) {
        const job = await dependencies.postgres.claimNextTenantBackup();
        if (!job) break;
        try {
          const result = await writeTenantBackup({ job, postgres: dependencies.postgres, clickhouse: dependencies.clickhouse,
            backupRoot: dependencies.tenantBackupRoot });
          await dependencies.postgres.completeTenantBackup({
            jobId: job.id, archiveName: result.archiveName, byteCount: result.bytes,
            sha256: result.sha256
          });
        } catch (error) {
          await dependencies.postgres.failTenantBackup(job.id, safeError(error));
          app.log.error({ jobId: job.id, error: safeError(error) }, 'Backup lógico do cliente falhou');
        }
      }
    } finally { running = false; }
  };
  const trigger = () => { void processTenantQueue(); };
  trigger();
  void cleanupExpiredTenantArchives();
  const tenantTimer = setInterval(() => void processTenantQueue(), 5_000);
  const cleanupTimer = setInterval(() => void cleanupExpiredTenantArchives(), 3_600_000);
  tenantTimer.unref(); cleanupTimer.unref();
  app.addHook('onClose', async () => {
    stopped = true; clearInterval(tenantTimer); clearInterval(cleanupTimer);
  });
  return trigger;
}
