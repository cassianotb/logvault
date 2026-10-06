import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('cadastros administrativos em janelas', () => {
  it('abre planos e usuários em modais, preservando os formulários existentes', () => {
    const html = readFileSync('web/index.html', 'utf8');
    const script = readFileSync('web/app.js', 'utf8');

    expect(html).toContain('id="plan-dialog"');
    expect(html).toContain('id="open-plan-dialog"');
    expect(html).toContain('id="create-plan-form"');
    expect(html).toContain('id="edit-plan-dialog"');
    expect(html).toContain('id="edit-plan-form"');
    expect(html).toContain('id="user-dialog"');
    expect(html).toContain('id="open-user-dialog"');
    expect(html).toContain('id="create-user-form"');
    expect(html).toContain('id="generate-user-password"');
    expect(html).toContain('id="edit-user-dialog"');
    expect(html).toContain('id="edit-user-form"');
    expect(script).toContain('planDialog.showModal()');
    expect(script).toContain('editPlanDialog.showModal()');
    expect(script).toContain('nameCell.textContent = plan.name');
    expect(script).not.toContain('name.dataset.planName');
    expect(script).toContain('userDialog.showModal()');
    expect(script).toContain('generateUserPasswordButton.addEventListener');
    expect(script).toContain("edit.textContent = 'Editar'");
    expect(script).toContain('nameCell.textContent = user.name');
    expect(script).not.toContain('nameInput.dataset.userName');
    expect(script).toContain("userDialogTitle.textContent = platformContext ? 'Adicionar usuário da plataforma' : 'Adicionar usuário'");
    expect(html).toContain('class="client-onboarding-card compact-onboarding-card"');
    expect(html).not.toContain('Dados organizados');
    expect(html).not.toContain('Plano validado');
    expect(html).not.toContain('Acesso imediato');
    expect(html).not.toContain('Limite configurável');
    expect(html).not.toContain('Disponível imediatamente');
    expect(html).not.toContain('Acesso individual');
    expect(html).not.toContain('Permissões controladas');
    expect(html).not.toContain('Auditoria preservada');
  });

  it('abre equipamentos e coletores em modais com opções visuais', () => {
    const html = readFileSync('web/index.html', 'utf8');
    const script = readFileSync('web/app.js', 'utf8');

    expect(html).toContain('id="device-create-dialog"');
    expect(html).toContain('id="open-device-create-dialog"');
    expect(html).toContain('name="vendor" value="cisco"');
    expect(html).toContain('name="vendor" value="a10"');
    expect(html).toContain('/assets/vendors/cisco.svg');
    expect(html).toContain('/assets/vendors/a10.png');
    expect(html).toContain('id="collector-create-dialog"');
    expect(html).toContain('id="open-collector-create-dialog"');
    expect(html).toContain('name="mode" value="edge"');
    expect(html).toContain('name="mode" value="cloud"');
    expect(html).toContain('Coletor local instalado na infraestrutura do cliente.');
    expect(html).toContain('Coletor em nuvem hospedado na infraestrutura da LogVault.');
    expect(script).toContain('deviceCreateDialog.showModal()');
    expect(script).toContain('collectorCreateDialog.showModal()');
    expect(script).toContain("input[name=\"mode\"][value=\"cloud\"]");
  });

  it('mantém somente backup e importação locais', () => {
    const html = readFileSync('web/index.html', 'utf8');
    const script = readFileSync('web/app.js', 'utf8');

    expect(html).toContain('id="import-platform-backup"');
    expect(html).toContain('id="backup-import-file"');
    expect(html).not.toContain('Google Drive');
    expect(html).not.toContain('Enviar último ao Drive');
    expect(script).not.toContain('backup-destination');
    expect(script).not.toContain('sendToGoogleDrive');
  });

  it('documenta os três perfis fixos do cliente sem sugerir perfis personalizados', () => {
    const html = readFileSync('web/index.html', 'utf8');
    const script = readFileSync('web/app.js', 'utf8');

    expect(html).toContain('Entender os perfis de acesso do cliente');
    expect(html).toContain('O ambiente do cliente utiliza três perfis fixos.');
    expect(html).toContain('<strong>Administrador</strong><small>Gerenciamento completo</small>');
    expect(html).toContain('<strong>Operador</strong><small>Operação diária</small>');
    expect(html).toContain('<strong>Auditor</strong><small>Consulta ampliada</small>');
    expect(html).toContain('O botão “Adicionar perfil” existe somente na administração da plataforma LogVault.');
    expect(script).toContain('Gerencie contas individuais e atribua um dos três perfis fixos de acesso do cliente.');
    expect(script).toContain('Crie uma conta e selecione o perfil fixo: Administrador, Operador ou Auditor.');
  });
});
