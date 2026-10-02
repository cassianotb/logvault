import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('proxy da API', () => {
  it('aceita o mesmo limite de corpo configurado na ingestão', () => {
    const nginx = readFileSync(new URL('../infra/nginx/default.conf', import.meta.url), 'utf8');
    expect(nginx).toContain('client_max_body_size 64m;');
  });

  it('recarrega o Nginx durante atualizações das duas funções de servidor', () => {
    const updater = readFileSync(new URL('../scripts/update-argus.sh', import.meta.url), 'utf8');
    expect(updater).toContain('docker compose --env-file "$env_file" restart web');
    expect(updater).toContain('--profile failover restart web-b');
  });
});
