#!/usr/bin/env node
import { createDecipheriv, scryptSync } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, readFile, stat, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

function usage() {
  console.error('Uso: node scripts/decrypt-backup.mjs ARQUIVO.lvault SAIDA.tar.gz ARQUIVO_DA_FRASE');
  process.exit(2);
}

const [sourcePath, outputPath, passphrasePath] = process.argv.slice(2);
if (!sourcePath || !outputPath || !passphrasePath || sourcePath === outputPath) usage();

let outputCreated = false;
try {
  const source = await open(sourcePath, 'r');
  try {
    const prefix = Buffer.alloc(4096);
    const { bytesRead } = await source.read(prefix, 0, prefix.length, 0);
    const newline = prefix.subarray(0, bytesRead).indexOf(0x0a);
    if (newline < 1) throw new Error('Cabeçalho LogVault não encontrado');
    const header = JSON.parse(prefix.subarray(0, newline).toString('utf8'));
    if (header?.format !== 'logvault-backup' || header?.version !== 1 || header?.cipher !== 'aes-256-gcm' || header?.kdf !== 'scrypt') {
      throw new Error('Formato de backup não suportado');
    }
    const salt = Buffer.from(String(header.salt), 'base64');
    const iv = Buffer.from(String(header.iv), 'base64');
    if (salt.length !== 16 || iv.length !== 12) throw new Error('Parâmetros criptográficos inválidos');
    const sourceSize = (await source.stat()).size;
    const cipherStart = newline + 1;
    const cipherBytes = sourceSize - cipherStart - 16;
    if (cipherBytes < 0) throw new Error('Arquivo de backup truncado');
    const tag = Buffer.alloc(16);
    await source.read(tag, 0, 16, sourceSize - 16);
    const passphrase = (await readFile(passphrasePath, 'utf8')).replace(/[\r\n]+$/, '');
    if (passphrase.length < 20) throw new Error('A frase de recuperação deve ter pelo menos 20 caracteres');
    const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    outputCreated = true;
    await pipeline(
      createReadStream(sourcePath, { start: cipherStart, end: cipherStart + cipherBytes - 1 }),
      decipher,
      createWriteStream(outputPath, { mode: 0o600 })
    );
    key.fill(0);
  } finally { await source.close(); }
  console.log(`Backup descriptografado em ${outputPath}`);
} catch (error) {
  if (outputCreated) await unlink(outputPath).catch(() => undefined);
  console.error(`Falha ao descriptografar: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
