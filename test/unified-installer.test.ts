import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const installer = resolve('install.sh');

function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync('bash', [installer, ...args], {
    encoding: 'utf8',
    env: { ...process.env, TERM: 'xterm-256color', ...env }
  });
}

describe('instalador unificado do LogVault', () => {
  it('documenta os perfis e a atualização disponíveis', () => {
    const result = run(['--help']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('system');
    expect(result.stdout).toContain('collector');
    expect(result.stdout).toContain('secondary');
    expect(result.stdout).toContain('update');
    expect(result.stdout).toContain('Alta Disponibilidade > Adicionar servidor standby');
    expect(result.stdout).not.toContain('dc-b');
  });

  it('informa a versão do LogVault pela linha de comando', () => {
    const result = run(['--version'], { LOGVAULT_VERSION: '2.4.1', LOGVAULT_BUILD: 'release-20401' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('LogVault 2.4.1 (build release-20401)');
  });

  it('renderiza a prévia sem executar alterações', () => {
    const result = run(['--preview'], {
      NO_COLOR: '1', LOGVAULT_VERSION: '2.4.1', LOGVAULT_BUILD: 'release-20401'
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Assistente de instalação');
    expect(result.stdout).toContain('---------------- L O G   I N T E L L I G E N C E ----------------\n\n  Versão 2.4.1\n  build release-20401');
    expect(result.stdout).toContain('Sistema LogVault');
    expect(result.stdout).toContain('proxy e HTTPS automático');
    expect(result.stdout).toContain('Coletor local');
    expect(result.stdout).toContain('Sistema LogVault Standby');
    expect(result.stdout).toContain('Atualizar LogVault');
    expect(result.stdout).not.toContain('Continuidade antiga (legada)');
    expect(result.stdout).not.toContain('\u001b[');
  });

  it('aplica a paleta Azul elétrico quando cores são forçadas', () => {
    const result = run(['--preview'], { FORCE_COLOR: '1', NO_COLOR: '' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('\u001b[38;2;54;215;255m');
    expect(result.stdout).toContain('\u001b[38;2;22;131;255m');
    expect(result.stdout).toContain('\u001b[38;2;107;140;255m');
  });

  it('permite forçar a prévia colorida mesmo quando NO_COLOR está definido', () => {
    const result = run(['--preview', '--color'], { TERM: 'dumb', NO_COLOR: '1' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('\u001b[38;2;54;215;255m');
    expect(result.stdout).toContain('\u001b[38;2;22;131;255m');
  });

  it('encaminha as opções do sistema sem executar o instalador', () => {
    const result = run([
      '--dry-run', 'system', '--domain', 'logs.example.com', '--no-apply'
    ], { NO_COLOR: '1' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('install-argus.sh configure');
    expect(result.stdout).toContain('--domain logs.example.com --no-apply');
  });

  it('seleciona o coletor e encaminha suas opções', () => {
    const dryRun = run([
      '--dry-run', 'collector', '--config-file', '/secure/collector.env', '--prepare-only'
    ], { NO_COLOR: '1' });
    expect(dryRun.status, dryRun.stderr).toBe(0);
    expect(dryRun.stdout).toContain('install-edge.sh');
    expect(dryRun.stdout).toContain('--config-file /secure/collector.env --prepare-only');
  });

  it('não expõe o instalador legado pelo comando unificado', () => {
    const result = run(['--dry-run', 'dc-b'], { NO_COLOR: '1' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('opção ou perfil desconhecido: dc-b');
  });

  it('seleciona a segunda VM e encaminha o pareamento ao novo instalador', () => {
    const dryRun = run([
      '--dry-run', 'secondary', '--primary-url', 'https://principal.example.com',
      '--enrollment-token', 'abcdefghijklmnopqrstuvwxyz123456'
    ], { NO_COLOR: '1' });
    expect(dryRun.status, dryRun.stderr).toBe(0);
    expect(dryRun.stdout).toContain('install-secondary.sh');
    expect(dryRun.stdout).toContain('--primary-url https://principal.example.com');
  });

  it('encaminha a atualização somente ao atualizador do sistema', () => {
    const dryRun = run([
      '--dry-run', 'update', '--check'
    ], { NO_COLOR: '1' });
    expect(dryRun.status, dryRun.stderr).toBe(0);
    expect(dryRun.stdout).toContain('update-argus.sh --check');
    expect(dryRun.stdout).not.toContain('update-edge.sh');
  });

  it('exige seleção explícita quando não há terminal interativo', () => {
    const result = run([], { NO_COLOR: '1' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("informe 'system', 'collector', 'secondary' ou 'update'");
  });
});
