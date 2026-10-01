import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('instalador do servidor redundante', () => {
  it('pareia pela API publicada sob /api', () => {
    const root = mkdtempSync(join(tmpdir(), 'logvault-secondary-installer-'));
    const scripts = join(root, 'scripts');
    const bin = join(root, 'bin');
    const capturedUrl = join(root, 'curl-url');
    mkdirSync(scripts);
    mkdirSync(bin);
    copyFileSync(resolve('scripts/install-secondary.sh'), join(scripts, 'install-secondary.sh'));

    writeFileSync(join(scripts, 'install-argus.sh'), `#!/usr/bin/env bash
set -eu
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
printf 'ARGUS_PUBLIC_URL=https://secondary.example.com\\n' >"$script_dir/../.env"
`);
    writeFileSync(join(bin, 'curl'), `#!/usr/bin/env bash
set -eu
for value in "$@"; do
  case "$value" in https://*) printf '%s' "$value" >"$CAPTURED_URL" ;; esac
done
printf '%s' '{"status":"enrolled","siteId":"10000000-0000-4000-8000-000000000001","siteToken":"site-secret","primarySiteId":"20000000-0000-4000-8000-000000000002","primaryUrl":"https://primary.example.com"}'
`);
    chmodSync(join(scripts, 'install-argus.sh'), 0o755);
    chmodSync(join(bin, 'curl'), 0o755);

    const result = spawnSync('bash', [join(scripts, 'install-secondary.sh'),
      '--primary-url', 'https://primary.example.com',
      '--enrollment-token', 'abcdefghijklmnopqrstuvwxyz123456',
      '--prepare-only'
    ], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, CAPTURED_URL: capturedUrl }
    });

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(capturedUrl, 'utf8')).toBe('https://primary.example.com/api/v1/redundancy/enroll');
  });
});
