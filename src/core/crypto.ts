import { createHash, randomUUID } from 'node:crypto';
import type { CgnatEvent, RawRecord } from '../domain/models.js';

export function newId(): string {
  return randomUUID();
}

export function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function deterministicId(...parts: Array<string | number>): string {
  const bytes = createHash('sha256').update(parts.join('\0')).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return value;
}

export function batchChecksum(rawRecords: RawRecord[], events: CgnatEvent[]): string {
  const raw = rawRecords.map((record) => ({ rawId: record.rawId, rawSha256: record.rawSha256 }));
  const normalizedEvents = events.map((event) => ({ ...event, batchId: null }));
  return sha256(JSON.stringify(stableValue({ raw, events: normalizedEvents })));
}
