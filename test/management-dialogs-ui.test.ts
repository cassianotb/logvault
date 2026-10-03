import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('cadastros administrativos em janelas', () => {
  it('abre planos e usuários em modais, preservando os formulários existentes', () => {
    const html = readFileSync('web/index.html', 'utf8');
    const script = readFileSync('web/app.js', 'utf8');

    expect(html).toContain('id="plan-dialog"');
    expect(html).toContain('id="open-plan-dialog"');
    expect(html).toContain('id="create-plan-form"');
    expect(html).toContain('id="user-dialog"');
    expect(html).toContain('id="open-user-dialog"');
    expect(html).toContain('id="create-user-form"');
    expect(script).toContain('planDialog.showModal()');
    expect(script).toContain('userDialog.showModal()');
    expect(script).toContain("userDialogTitle.textContent = platformContext ? 'Adicionar usuário da plataforma' : 'Adicionar usuário'");
  });

  it('explica o modo de coleta conforme a opção selecionada', () => {
    const html = readFileSync('web/index.html', 'utf8');
    const script = readFileSync('web/app.js', 'utf8');

    expect(html).toContain('<option value="edge">Servidor local</option>');
    expect(html).toContain('<option value="cloud">Cloud</option>');
    expect(script).toContain('Coletor local instalado na infraestrutura do cliente.');
    expect(script).toContain('Coletor em nuvem hospedado na infraestrutura da LogVault.');
    expect(script).toContain("createCollectorForm.mode.addEventListener('change', syncCollectorModeHelp)");
  });
});
