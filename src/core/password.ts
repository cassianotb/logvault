import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, cost: number, blockSize: number, parallelism: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, {
      N: cost,
      r: blockSize,
      p: parallelism,
      maxmem: 64 * 1024 * 1024
    }, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM);
  return ['scrypt', COST, BLOCK_SIZE, PARALLELISM, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, costRaw, blockSizeRaw, parallelismRaw, saltRaw, keyRaw] = encoded.split('$');
  if (algorithm !== 'scrypt' || !costRaw || !blockSizeRaw || !parallelismRaw || !saltRaw || !keyRaw) return false;
  const cost = Number(costRaw);
  const blockSize = Number(blockSizeRaw);
  const parallelism = Number(parallelismRaw);
  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelism)) return false;
  const expected = Buffer.from(keyRaw, 'base64url');
  const actual = await derive(password, Buffer.from(saltRaw, 'base64url'), cost, blockSize, parallelism);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
