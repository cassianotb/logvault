import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('pareamento de redundância no painel', () => {
  it('exibe e copia somente o código esperado pelo instalador interativo', () => {
    const html = readFileSync('web/index.html', 'utf8');
    const script = readFileSync('web/app.js', 'utf8');

    expect(html).toContain('id="redundancy-token"');
    expect(html).toContain('id="copy-redundancy-token"');
    expect(html).toContain('Copiar código');
    expect(script).toContain('redundancyToken.value = payload.token');
    expect(script).toContain('navigator.clipboard.writeText(redundancyToken.value)');
    expect(script).not.toContain('redundancyToken.value = `sudo ./install.sh');
    expect(script).toContain("metric('NetFlow redundante'");
    expect(script).toContain("metric('Syslog redundante'");
    expect(html).not.toContain('MIGRAÇÃO DO LEGADO');
    expect(html).not.toContain('id="advance-redundancy-migration"');
    expect(html).toContain('id="tenant-manual-nav"');
    expect(html).toContain('Manual de uso do LogVault');
    expect(html).toContain('Enviar NetFlow v9 ao LogVault');
    expect(html).toContain('Enviar Syslog CGNAT ao LogVault');
    expect(script).not.toContain('ARGUS_COLLECTOR_VERSION=0.1.0');
  });
});
