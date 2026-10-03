import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('catálogo de integrações do cliente', () => {
  it('mantém o menu visível e informa quando não há integrações disponíveis', () => {
    const html = readFileSync('web/index.html', 'utf8');
    const script = readFileSync('web/app.js', 'utf8');

    expect(html).toContain('id="integrations-unavailable"');
    expect(html).toContain('Nenhuma integração disponível');
    expect(script).toContain("integrationsNav.hidden = platformContext || user.role !== 'admin'");
    expect(script).toContain('integrationsUnavailable.hidden = false');
    expect(script).not.toContain("view === 'integrations' && integrationProviderAvailability === false");
  });
});
