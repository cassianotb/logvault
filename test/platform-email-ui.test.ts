import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('configuração visual do e-mail da plataforma', () => {
  it('organiza resumo, configuração e validação sem alterar os formulários', () => {
    const html = readFileSync('web/index.html', 'utf8');
    const script = readFileSync('web/app.js', 'utf8');

    expect(html).toContain('class="platform-email-overview"');
    expect(html).toContain('class="platform-email-workspace"');
    expect(html).toContain('<strong>Conexão com o servidor</strong>');
    expect(html).toContain('<strong>Autenticação</strong>');
    expect(html).toContain('<strong>Identidade de envio</strong>');
    expect(html).toContain('class="platform-email-sender-preview"');
    expect(html).toContain('id="icon-mail"');
    expect(html).toContain('class="platform-email-status-card primary"><span class="platform-email-card-icon" aria-hidden="true"><svg><use href="#icon-mail"/></svg>');
    expect(html).toContain('id="platform-email-form"');
    expect(html).toContain('id="platform-email-test-form"');
    expect(html).toContain('<span class="button-label">Enviar e-mail de teste</span>');
    expect(script).toContain("testPlatformEmailButton.querySelector('.button-label')");
    expect(script).toContain("buttonLabel.textContent = 'Enviando…'");
  });
});
