import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { preparePrimaryContinuity } from '../src/core/continuity-host-control.js';

describe('controle local da continuidade', () => {
  it('troca uma solicitação validada por uma resposta do agente com o mesmo nonce', async () => {
    const controlDirectory = await mkdtemp(join(tmpdir(), 'logvault-continuity-'));
    const preparation = preparePrimaryContinuity({
      controlDirectory,
      siteAHost: 'dc-a.internal',
      siteBHost: 'dc-b.internal',
      timeoutMs: 5_000
    });
    let request = '';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try { request = await readFile(join(controlDirectory, 'request.env'), 'utf8'); break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 25)); }
    }
    expect(request).toContain('site_a_host=dc-a.internal');
    expect(request).toContain('site_b_host=dc-b.internal');
    const nonce = /^nonce=([a-f0-9]+)$/m.exec(request)?.[1];
    expect(nonce).toBeTruthy();
    await writeFile(join(controlDirectory, 'response.env'), `nonce=${nonce}\nstatus=ok\nmessage=pronto\nbind=10.0.0.10\ncidr=10.0.0.20/32\n`);
    await expect(preparation).resolves.toEqual({ bind: '10.0.0.10', cidr: '10.0.0.20/32' });
  });
});
