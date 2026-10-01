import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from './auth.js';
import { requirePlatformAccess } from './access-control.js';
import type { ClickHouseRepository } from './clickhouse.js';
import type { PlatformBackupDestination, PostgresRepository, TenantBackupJob } from './postgres.js';
import { openSecret, sealSecret } from '../core/secret-box.js';
import { createEncryptedTarGz, createTarGz, encryptBackupFile, fileDigest } from '../core/backup-archive.js';
import {
  parseGoogleServiceAccount, pruneGoogleDriveBackups, testGoogleDriveFolder, uploadGoogleDriveFile
} from '../core/google-drive-backup.js';

const destinationSchema = z.object({
  enabled: z.boolean(),
  folderId: z.string().trim().max(200).refine((value) => !value || /^[A-Za-z0-9_-]{10,200}$/.test(value), 'ID da pasta inválido'),
  serviceAccountJson: z.string().max(32_000).default(''),
  encryptionPassphrase: z.string().max(256).default(''),
  retentionDays: z.number().int().min(1).max(3650)
});
const createJobSchema = z.object({ sendToGoogleDrive: z.boolean().default(false) });
const jobParamsSchema = z.object({ jobId: z.string().uuid() });

function publicDestination(settings: PlatformBackupDestination | null) {
  return settings ? {
    enabled: settings.enabled, provider: settings.provider, folderId: settings.folderId,
    credentialsConfigured: Boolean(settings.serviceAccountSecret),
    encryptionConfigured: Boolean(settings.encryptionPassphraseSecret),
    retentionDays: settings.retentionDays, lastTestAt: settings.lastTestAt,
    lastTestStatus: settings.lastTestStatus, lastTestError: settings.lastTestError,
    updatedAt: settings.updatedAt
  } : {
    enabled: false, provider: 'google_drive', folderId: '', credentialsConfigured: false,
    encryptionConfigured: false, retentionDays: 30, lastTestAt: null,
    lastTestStatus: null, lastTestError: '', updatedAt: null
  };
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ').slice(0, 2000);
}

async function configuredDrive(postgres: PostgresRepository, encryptionKey: string): Promise<{
  settings: PlatformBackupDestination;
  credentials: ReturnType<typeof parseGoogleServiceAccount>;
  passphrase: string;
}> {
  const settings = await postgres.getPlatformBackupDestination();
  if (!settings?.enabled || settings.lastTestStatus !== 'success') throw new Error('Google Drive não está habilitado e validado pela plataforma');
  const credentials = parseGoogleServiceAccount(openSecret(settings.serviceAccountSecret, encryptionKey));
  const passphrase = openSecret(settings.encryptionPassphraseSecret, encryptionKey);
  if (passphrase.length < 20) throw new Error('Frase de recuperação do backup não está configurada');
  return { settings, credentials, passphrase };
}

async function writeTenantBackup(input: {
  job: TenantBackupJob; postgres: PostgresRepository; clickhouse: ClickHouseRepository;
  backupRoot: string; encryptionKey: string; warn?: (error: unknown, message: string) => void;
}): Promise<{ archiveName: string; bytes: number; sha256: string; googleDriveFileId: string | null }> {
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
    let googleDriveFileId: string | null = null;
    if (input.job.sendToGoogleDrive) {
      const drive = await configuredDrive(input.postgres, input.encryptionKey);
      const previous = await input.postgres.getExternalBackupUpload('tenant', input.job.id);
      if (previous?.status === 'success' && previous.remoteFileId) {
        googleDriveFileId = previous.remoteFileId;
        return { archiveName, ...digest, googleDriveFileId };
      }
      const encryptedPath = `${archivePath}.lvault`;
      await encryptBackupFile({ sourcePath: archivePath, outputPath: encryptedPath, passphrase: drive.passphrase });
      const encryptedDigest = await fileDigest(encryptedPath);
      await input.postgres.beginExternalBackupUpload({ scope: 'tenant', sourceBackupId: input.job.id, tenantId: input.job.tenantId });
      try {
        const uploaded = await uploadGoogleDriveFile({
          credentials: drive.credentials, folderId: drive.settings.folderId, filePath: encryptedPath,
          fileName: `${archiveName}.lvault`,
          appProperties: { logvaultScope: 'tenant', tenantId: input.job.tenantId, backupId: input.job.id }
        });
        googleDriveFileId = uploaded.id;
        await input.postgres.completeExternalBackupUpload({
          scope: 'tenant', sourceBackupId: input.job.id, byteCount: encryptedDigest.bytes,
          sha256: encryptedDigest.sha256, remoteFileId: uploaded.id
        });
        try {
          await pruneGoogleDriveBackups({
            credentials: drive.credentials, folderId: drive.settings.folderId,
            scope: 'tenant', retentionDays: drive.settings.retentionDays
          });
        } catch (error) { input.warn?.(error, 'Não foi possível aplicar a retenção dos backups de clientes no Google Drive'); }
      } catch (error) {
        await input.postgres.failExternalBackupUpload('tenant', input.job.id, safeError(error));
        throw error;
      } finally { await rm(encryptedPath, { force: true }); }
    }
    return { archiveName, ...digest, googleDriveFileId };
  } finally {
    await rm(jobRoot, { recursive: true, force: true });
  }
}

async function syncLatestPlatformBackup(input: {
  postgres: PostgresRepository; backupRoot: string; stagingRoot: string; encryptionKey: string;
  warn?: (error: unknown, message: string) => void;
}): Promise<void> {
  let latest: { id?: unknown; backupType?: unknown; baseBackupId?: unknown };
  try { latest = JSON.parse(await readFile(join(input.backupRoot, 'LAST_SUCCESS.json'), 'utf8')) as typeof latest; }
  catch { return; }
  if (typeof latest.id !== 'string' || !/^\d{8}T\d{6}Z$/.test(latest.id)) return;
  const previous = await input.postgres.getExternalBackupUpload('platform', latest.id);
  if (previous?.status === 'success') return;
  const drive = await configuredDrive(input.postgres, input.encryptionKey);
  const entries = [latest.id];
  if (latest.backupType === 'incremental' && typeof latest.baseBackupId === 'string' && /^\d{8}T\d{6}Z$/.test(latest.baseBackupId)) {
    entries.unshift(latest.baseBackupId);
  }
  await mkdir(input.stagingRoot, { recursive: true, mode: 0o700 });
  const encryptedPath = join(input.stagingRoot, `logvault-platform-${latest.id}.tar.gz.lvault`);
  await input.postgres.beginExternalBackupUpload({ scope: 'platform', sourceBackupId: latest.id, tenantId: null });
  try {
    await createEncryptedTarGz({
      sourceDirectory: join(input.backupRoot, 'runs'), entries,
      outputPath: encryptedPath, passphrase: drive.passphrase
    });
    const digest = await fileDigest(encryptedPath);
    const uploaded = await uploadGoogleDriveFile({
      credentials: drive.credentials, folderId: drive.settings.folderId, filePath: encryptedPath,
      fileName: `logvault-platform-${latest.id}.tar.gz.lvault`,
      appProperties: { logvaultScope: 'platform', backupId: latest.id }
    });
    await input.postgres.completeExternalBackupUpload({
      scope: 'platform', sourceBackupId: latest.id, byteCount: digest.bytes,
      sha256: digest.sha256, remoteFileId: uploaded.id
    });
    try {
      await pruneGoogleDriveBackups({
        credentials: drive.credentials, folderId: drive.settings.folderId,
        scope: 'platform', retentionDays: drive.settings.retentionDays
      });
    } catch (error) { input.warn?.(error, 'Não foi possível aplicar a retenção do backup da plataforma no Google Drive'); }
  } catch (error) {
    await input.postgres.failExternalBackupUpload('platform', latest.id, safeError(error));
    throw error;
  } finally {
    await rm(encryptedPath, { force: true });
  }
}

export function registerBackupRoutes(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository; encryptionKey: string; tenantBackupRoot: string;
  trigger: () => void;
}): void {
  app.get('/v1/platform/backup-destination', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (session.context !== 'platform') return reply.code(403).send({ error: 'platform_context_required' });
    if (!requirePlatformAccess(session, reply, 'system', 'view')) return;
    const [destination, latestUpload] = await Promise.all([
      dependencies.postgres.getPlatformBackupDestination(),
      dependencies.postgres.getLatestExternalBackupUpload('platform')
    ]);
    return reply.send({ destination: publicDestination(destination), latestUpload });
  });

  app.put('/v1/platform/backup-destination', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (session.context !== 'platform') return reply.code(403).send({ error: 'platform_context_required' });
    if (!requirePlatformAccess(session, reply, 'system', 'manage')) return;
    const parsed = destinationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_backup_destination', details: parsed.error.flatten() });
    const current = await dependencies.postgres.getPlatformBackupDestination();
    let serviceAccountSecret = current?.serviceAccountSecret ?? '';
    let encryptionPassphraseSecret = current?.encryptionPassphraseSecret ?? '';
    if (parsed.data.serviceAccountJson) {
      parseGoogleServiceAccount(parsed.data.serviceAccountJson);
      serviceAccountSecret = sealSecret(parsed.data.serviceAccountJson, dependencies.encryptionKey);
    }
    if (parsed.data.encryptionPassphrase) {
      if (parsed.data.encryptionPassphrase.length < 20) return reply.code(400).send({ error: 'backup_passphrase_too_short' });
      encryptionPassphraseSecret = sealSecret(parsed.data.encryptionPassphrase, dependencies.encryptionKey);
    }
    if (parsed.data.enabled && (!parsed.data.folderId || !serviceAccountSecret || !encryptionPassphraseSecret)) {
      return reply.code(400).send({ error: 'backup_destination_fields_required' });
    }
    const saved = await dependencies.postgres.savePlatformBackupDestination({
      actorUserId: session.id, enabled: parsed.data.enabled, folderId: parsed.data.folderId,
      serviceAccountSecret, encryptionPassphraseSecret, retentionDays: parsed.data.retentionDays,
      credentialsChanged: Boolean(parsed.data.serviceAccountJson), passphraseChanged: Boolean(parsed.data.encryptionPassphrase)
    });
    return reply.send({ destination: publicDestination(saved) });
  });

  app.post('/v1/platform/backup-destination/test', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (session.context !== 'platform') return reply.code(403).send({ error: 'platform_context_required' });
    if (!requirePlatformAccess(session, reply, 'system', 'manage')) return;
    const settings = await dependencies.postgres.getPlatformBackupDestination();
    if (!settings?.serviceAccountSecret || !settings.folderId) return reply.code(409).send({ error: 'backup_destination_not_configured' });
    try {
      const folder = await testGoogleDriveFolder({
        credentials: parseGoogleServiceAccount(openSecret(settings.serviceAccountSecret, dependencies.encryptionKey)),
        folderId: settings.folderId
      });
      await dependencies.postgres.recordPlatformBackupDestinationTest({ actorUserId: session.id, status: 'success', error: '' });
      dependencies.trigger();
      return reply.send({ status: 'success', folder });
    } catch (error) {
      const message = safeError(error);
      await dependencies.postgres.recordPlatformBackupDestinationTest({ actorUserId: session.id, status: 'failed', error: message });
      return reply.code(422).send({ error: 'backup_destination_test_failed', message });
    }
  });

  app.get('/v1/backups', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    const jobs = await dependencies.postgres.listTenantBackupJobs(session.tenantId);
    const destination = await dependencies.postgres.getPlatformBackupDestination();
    return reply.send({ backups: jobs, googleDriveAvailable: Boolean(destination?.enabled && destination.lastTestStatus === 'success') });
  });

  app.post('/v1/backups', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    if (session.role !== 'admin') return reply.code(403).send({ error: 'tenant_administrator_required' });
    const parsed = createJobSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_tenant_backup_request' });
    if (parsed.data.sendToGoogleDrive) {
      const destination = await dependencies.postgres.getPlatformBackupDestination();
      if (!destination?.enabled || destination.lastTestStatus !== 'success') return reply.code(409).send({ error: 'google_drive_not_available' });
    }
    const job = await dependencies.postgres.createTenantBackupJob({
      tenantId: session.tenantId, actorUserId: session.id, sendToGoogleDrive: parsed.data.sendToGoogleDrive
    });
    if (job === 'active_exists') return reply.code(409).send({ error: 'tenant_backup_already_running' });
    dependencies.trigger();
    return reply.code(202).send({ backup: job });
  });

  app.get('/v1/backups/:jobId/download', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    if (session.role !== 'admin') return reply.code(403).send({ error: 'tenant_administrator_required' });
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
  postgres: PostgresRepository; clickhouse: ClickHouseRepository; backupRoot: string;
  tenantBackupRoot: string; stagingRoot: string; encryptionKey: string;
}): Promise<() => void> {
  let running = false;
  let platformSyncRunning = false;
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
            backupRoot: dependencies.tenantBackupRoot, encryptionKey: dependencies.encryptionKey,
            warn: (error, message) => app.log.warn({ error: safeError(error) }, message) });
          await dependencies.postgres.completeTenantBackup({
            jobId: job.id, archiveName: result.archiveName, byteCount: result.bytes,
            sha256: result.sha256, googleDriveFileId: result.googleDriveFileId
          });
        } catch (error) {
          await dependencies.postgres.failTenantBackup(job.id, safeError(error));
          app.log.error({ jobId: job.id, error: safeError(error) }, 'Backup lógico do cliente falhou');
        }
      }
    } finally { running = false; }
  };
  const processPlatform = async () => {
    if (platformSyncRunning || stopped) return;
    platformSyncRunning = true;
    try {
      const settings = await dependencies.postgres.getPlatformBackupDestination();
      if (settings?.enabled && settings.lastTestStatus === 'success') {
        await syncLatestPlatformBackup({ postgres: dependencies.postgres, backupRoot: dependencies.backupRoot,
          stagingRoot: dependencies.stagingRoot, encryptionKey: dependencies.encryptionKey,
          warn: (error, message) => app.log.warn({ error: safeError(error) }, message) });
      }
    } catch (error) {
      app.log.error({ error: safeError(error) }, 'Cópia do backup da plataforma para o Google Drive falhou');
    } finally { platformSyncRunning = false; }
  };
  const trigger = () => { void processTenantQueue(); void processPlatform(); };
  trigger();
  void cleanupExpiredTenantArchives();
  const tenantTimer = setInterval(() => void processTenantQueue(), 5_000);
  const platformTimer = setInterval(() => void processPlatform(), 60_000);
  const cleanupTimer = setInterval(() => void cleanupExpiredTenantArchives(), 3_600_000);
  tenantTimer.unref(); platformTimer.unref(); cleanupTimer.unref();
  app.addHook('onClose', async () => {
    stopped = true; clearInterval(tenantTimer); clearInterval(platformTimer); clearInterval(cleanupTimer);
  });
  return trigger;
}
