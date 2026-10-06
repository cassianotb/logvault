import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, cp, lstat, mkdir, readFile, readdir, rename, rm, stat, statfs } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { decryptBackupFile } from './backup-archive.js';

const execFileAsync = promisify(execFile);
const backupIdPattern = /^\d{8}T\d{6}Z$/;
const safeEntryPattern = /^[A-Za-z0-9._/-]+$/;

interface BackupMetadata {
  id: string;
  createdAt: string;
  backupType: 'full' | 'incremental';
  baseBackupId: string | null;
}

function safeArchiveEntry(value: string): boolean {
  return Boolean(value && safeEntryPattern.test(value) && !value.startsWith('/')
    && !value.split('/').some((part) => part === '..' || part === ''));
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function validateTree(root: string): Promise<void> {
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const contained = relative(root, path);
      if (!contained || contained.startsWith(`..${sep}`) || contained === '..') throw new Error('Caminho inválido no backup');
      const details = await lstat(path);
      if (details.isSymbolicLink() || (!details.isDirectory() && !details.isFile())) {
        throw new Error('O backup contém links ou tipos de arquivo não permitidos');
      }
      if (details.isDirectory()) await visit(path);
    }
  };
  await visit(root);
}

function parseMetadata(value: unknown, expectedId: string): BackupMetadata {
  if (!value || typeof value !== 'object') throw new Error(`Metadados ausentes no backup ${expectedId}`);
  const candidate = value as Record<string, unknown>;
  const backupType = candidate.backupType === 'incremental' ? 'incremental' : candidate.backupType === 'full' || candidate.backupType === undefined ? 'full' : null;
  const baseBackupId = candidate.baseBackupId === null || candidate.baseBackupId === undefined || candidate.baseBackupId === ''
    ? null : typeof candidate.baseBackupId === 'string' && backupIdPattern.test(candidate.baseBackupId) ? candidate.baseBackupId : undefined;
  if (candidate.id !== expectedId || typeof candidate.createdAt !== 'string' || !Number.isFinite(Date.parse(candidate.createdAt))
    || !backupType || baseBackupId === undefined || (backupType === 'incremental' && !baseBackupId)) {
    throw new Error(`Metadados inválidos no backup ${expectedId}`);
  }
  return { id: expectedId, createdAt: candidate.createdAt, backupType, baseBackupId };
}

async function validateChecksums(runRoot: string, backupId: string): Promise<void> {
  const checksumPath = join(runRoot, 'checksums.sha256');
  const lines = (await readFile(checksumPath, 'utf8')).split(/\r?\n/).filter(Boolean);
  if (!lines.length) throw new Error(`Lista de integridade vazia no backup ${backupId}`);
  const checked = new Set<string>();
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})  ([A-Za-z0-9._/-]+)$/);
    if (!match || !match[1] || !match[2] || !safeArchiveEntry(match[2])) {
      throw new Error(`Lista de integridade inválida no backup ${backupId}`);
    }
    const filePath = resolve(runRoot, match[2]);
    if (!filePath.startsWith(`${resolve(runRoot)}${sep}`)) throw new Error('Checksum aponta para fora do backup');
    const details = await lstat(filePath).catch(() => null);
    if (!details?.isFile()) throw new Error(`Arquivo obrigatório ausente: ${match[2]}`);
    if (await sha256(filePath) !== match[1]) throw new Error(`Falha de integridade em ${match[2]}`);
    checked.add(match[2]);
  }
  for (const required of ['postgres.dump', 'metadata.json']) {
    if (!checked.has(required)) throw new Error(`Checksum obrigatório ausente: ${required}`);
  }
  const clickhouse = await stat(join(runRoot, 'clickhouse')).catch(() => null);
  if (!clickhouse?.isDirectory()) throw new Error(`Dados do ClickHouse ausentes no backup ${backupId}`);
  const complete = await stat(join(runRoot, 'COMPLETE')).catch(() => null);
  if (!complete?.isFile()) throw new Error(`Marcador de conclusão ausente no backup ${backupId}`);
}

async function setImportedPermissions(root: string): Promise<void> {
  const visit = async (path: string): Promise<void> => {
    const details = await lstat(path);
    if (details.isDirectory()) {
      await chmod(path, 0o755);
      for (const entry of await readdir(path)) await visit(join(path, entry));
    } else await chmod(path, 0o640);
  };
  await visit(root);
}

export async function importPlatformBackup(input: {
  sourcePath: string;
  sourceName: string;
  passphrase?: string;
  workspaceRoot: string;
  backupRoot: string;
}): Promise<{ backupIds: string[]; imported: string[]; alreadyPresent: string[]; totalBytes: number }> {
  await mkdir(input.workspaceRoot, { recursive: true, mode: 0o700 });
  const encrypted = input.sourceName.toLowerCase().endsWith('.lvault');
  const archivePath = encrypted ? join(input.workspaceRoot, 'backup.tar.gz') : input.sourcePath;
  const extractRoot = join(input.workspaceRoot, 'extracted');
  if (encrypted) await decryptBackupFile({
    sourcePath: input.sourcePath, outputPath: archivePath, passphrase: input.passphrase ?? ''
  });
  await mkdir(extractRoot, { recursive: true, mode: 0o700 });
  const { stdout: names } = await execFileAsync('tar', ['-tzf', archivePath], { maxBuffer: 64 * 1024 * 1024 });
  const entries = names.split(/\r?\n/).filter(Boolean).map((entry) => entry.replace(/\/$/, ''));
  if (!entries.length || entries.some((entry) => !safeArchiveEntry(entry))) {
    throw new Error('O arquivo contém caminhos não permitidos');
  }
  const { stdout: verbose } = await execFileAsync('tar', ['-tvzf', archivePath, '--numeric-owner'], { maxBuffer: 64 * 1024 * 1024 });
  let expandedBytes = 0;
  for (const line of verbose.split(/\r?\n/).filter(Boolean)) {
    if (!['-', 'd'].includes(line[0] ?? '')) throw new Error('O arquivo contém links ou tipos não permitidos');
    const size = line.trim().split(/\s+/)[2];
    if (!size || !/^\d+$/.test(size)) throw new Error('Não foi possível validar o tamanho do conteúdo do backup');
    expandedBytes += Number(size);
    if (!Number.isSafeInteger(expandedBytes)) throw new Error('O conteúdo expandido do backup é grande demais');
  }
  const filesystem = await statfs(input.workspaceRoot);
  const availableBytes = filesystem.bavail * filesystem.bsize;
  if (expandedBytes + 512 * 1024 * 1024 > availableBytes) {
    throw new Error('Não há espaço suficiente para validar o conteúdo expandido do backup');
  }
  await execFileAsync('tar', ['-xzf', archivePath, '--no-same-owner', '--no-same-permissions', '-C', extractRoot], {
    maxBuffer: 4 * 1024 * 1024
  });
  await validateTree(extractRoot);
  const backupIds = [...new Set(entries.map((entry) => entry.split('/')[0]).filter((entry): entry is string => Boolean(entry)))].sort();
  if (!backupIds.length || backupIds.length > 2 || backupIds.some((id) => !backupIdPattern.test(id))) {
    throw new Error('O pacote deve conter um ponto completo e, opcionalmente, seu incremental');
  }
  const metadata = new Map<string, BackupMetadata>();
  const archiveBytes = (await stat(input.sourcePath)).size;
  for (const backupId of backupIds) {
    const runRoot = join(extractRoot, backupId);
    const raw = JSON.parse(await readFile(join(runRoot, 'metadata.json'), 'utf8')) as unknown;
    metadata.set(backupId, parseMetadata(raw, backupId));
    await validateChecksums(runRoot, backupId);
  }
  if (backupIds.length === 2) {
    const incremental = [...metadata.values()].find((item) => item.backupType === 'incremental');
    if (!incremental?.baseBackupId || !metadata.has(incremental.baseBackupId)) {
      throw new Error('O pacote com dois pontos não contém uma cadeia completa e incremental válida');
    }
  }
  for (const item of metadata.values()) {
    if (item.backupType !== 'incremental' || !item.baseBackupId) continue;
    const baseInPackage = metadata.has(item.baseBackupId);
    const baseLocal = await stat(join(input.backupRoot, 'runs', item.baseBackupId, 'COMPLETE')).catch(() => null);
    if (!baseInPackage && !baseLocal?.isFile()) throw new Error(`A base ${item.baseBackupId} exigida pelo incremental não está disponível`);
  }
  const runsRoot = join(input.backupRoot, 'runs');
  await mkdir(runsRoot, { recursive: true, mode: 0o750 });
  const imported: string[] = [];
  const alreadyPresent: string[] = [];
  for (const backupId of backupIds) {
    const target = join(runsRoot, backupId);
    const existing = await stat(target).catch(() => null);
    if (existing && await stat(join(target, 'COMPLETE')).catch(() => null)) {
      alreadyPresent.push(backupId);
      continue;
    }
    if (existing) throw new Error(`Já existe um ponto incompleto com o ID ${backupId}`);
    const temporary = join(runsRoot, `.import-${backupId}-${randomUUID()}`);
    try {
      await cp(join(extractRoot, backupId), temporary, { recursive: true, errorOnExist: true, force: false });
      await setImportedPermissions(temporary);
      await rename(temporary, target);
      imported.push(backupId);
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }
  return { backupIds, imported, alreadyPresent, totalBytes: archiveBytes };
}
