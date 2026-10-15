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

  it('oferece o IXC com URL, token, teste e conclusão sem chave manual de ativação', () => {
    const html = readFileSync('web/index.html', 'utf8');
    const script = readFileSync('web/app.js', 'utf8');

    expect(html).toContain('id="select-ixc-integration"');
    expect(html).toContain('/assets/ixc-provedor-logo.png');
    expect(html).toContain('Identificação do assinante por API IXC.');
    expect(html).toContain('id="ixc-base-url"');
    expect(html).toContain('id="ixc-token"');
    expect(html).toContain('id="test-ixc"');
    expect(html).toContain('id="save-ixc-integration"');
    expect(html).not.toContain('id="ixc-enabled"');
    expect(script).toContain("integrationEndpoint('/test', 'ixc')");
    expect(script).toContain('await persistIxcIntegration(true');
  });
});
