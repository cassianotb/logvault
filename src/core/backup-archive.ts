import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, chmod, mkdir, open, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

export async function createTarGz(input: { sourceDirectory: string; entries: string[]; outputPath: string }): Promise<void> {
  await mkdir(dirname(input.outputPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn('tar', ['-czf', input.outputPath, '-C', input.sourceDirectory, ...input.entries], {
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let error = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { error = `${error}${chunk}`.slice(-4000); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(error || `tar encerrou com código ${code}`)));
  });
  await chmod(input.outputPath, 0o600);
}

export async function encryptBackupFile(input: { sourcePath: string; outputPath: string; passphrase: string }): Promise<void> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(input.passphrase, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const header = Buffer.from(`${JSON.stringify({
    format: 'logvault-backup', version: 1, cipher: 'aes-256-gcm', kdf: 'scrypt',
    salt: salt.toString('base64'), iv: iv.toString('base64')
  })}\n`, 'utf8');
  try {
    await mkdir(dirname(input.outputPath), { recursive: true });
    await writeFile(input.outputPath, header, { mode: 0o600 });
    await pipeline(createReadStream(input.sourcePath), cipher, createWriteStream(input.outputPath, { flags: 'a', mode: 0o600 }));
    await appendFile(input.outputPath, cipher.getAuthTag());
  } finally { key.fill(0); }
}

export async function createEncryptedTarGz(input: {
  sourceDirectory: string; entries: string[]; outputPath: string; passphrase: string;
}): Promise<void> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(input.passphrase, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const header = Buffer.from(`${JSON.stringify({
    format: 'logvault-backup', version: 1, cipher: 'aes-256-gcm', kdf: 'scrypt',
    salt: salt.toString('base64'), iv: iv.toString('base64')
  })}\n`, 'utf8');
  await mkdir(dirname(input.outputPath), { recursive: true });
  await writeFile(input.outputPath, header, { mode: 0o600 });
  const child = spawn('tar', ['-czf', '-', '-C', input.sourceDirectory, ...input.entries], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let error = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { error = `${error}${chunk}`.slice(-4000); });
  const closed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(error || `tar encerrou com código ${code}`)));
  });
  try {
    await Promise.all([
      closed,
      pipeline(child.stdout, cipher, createWriteStream(input.outputPath, { flags: 'a', mode: 0o600 }))
    ]);
    await appendFile(input.outputPath, cipher.getAuthTag());
  } finally {
    key.fill(0);
    if (child.exitCode === null) child.kill('SIGTERM');
  }
}

export async function decryptBackupFile(input: {
  sourcePath: string; outputPath: string; passphrase: string;
}): Promise<void> {
  if (input.passphrase.length < 20) throw new Error('A frase de recuperação deve ter pelo menos 20 caracteres');
  let outputCreated = false;
  const source = await open(input.sourcePath, 'r');
  try {
    const prefix = Buffer.alloc(4096);
    const { bytesRead } = await source.read(prefix, 0, prefix.length, 0);
    const newline = prefix.subarray(0, bytesRead).indexOf(0x0a);
    if (newline < 1) throw new Error('Cabeçalho LogVault não encontrado');
    const header = JSON.parse(prefix.subarray(0, newline).toString('utf8')) as Record<string, unknown>;
    if (header.format !== 'logvault-backup' || header.version !== 1 || header.cipher !== 'aes-256-gcm' || header.kdf !== 'scrypt') {
      throw new Error('Formato de backup criptografado não suportado');
    }
    const salt = Buffer.from(String(header.salt), 'base64');
    const iv = Buffer.from(String(header.iv), 'base64');
    if (salt.length !== 16 || iv.length !== 12) throw new Error('Parâmetros criptográficos inválidos');
    const sourceSize = (await source.stat()).size;
    const cipherStart = newline + 1;
    const cipherBytes = sourceSize - cipherStart - 16;
    if (cipherBytes < 1) throw new Error('Arquivo de backup truncado');
    const tag = Buffer.alloc(16);
    await source.read(tag, 0, tag.length, sourceSize - tag.length);
    const key = scryptSync(input.passphrase, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      outputCreated = true;
      await pipeline(
        createReadStream(input.sourcePath, { start: cipherStart, end: cipherStart + cipherBytes - 1 }),
        decipher,
        createWriteStream(input.outputPath, { mode: 0o600 })
      );
    } finally { key.fill(0); }
  } catch (error) {
    if (outputCreated) await unlink(input.outputPath).catch(() => undefined);
    throw error;
  } finally { await source.close(); }
}

export async function fileDigest(path: string): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return { bytes: (await stat(path)).size, sha256: hash.digest('hex') };
}
