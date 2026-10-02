import { readFileSync } from 'node:fs';

export function installedApplicationVersion(): string {
  try {
    const metadata = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version?: unknown };
    return typeof metadata.version === 'string' && metadata.version.trim() ? metadata.version.trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}
