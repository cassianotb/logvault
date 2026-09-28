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
    expect(result.stdout).toContain('dc-b');
    expect(result.stdout).toContain('update');
  });

  it('informa a versão do LogVault pela linha de comando', () => {
    const result = run(['--version'], { LOGVAULT_VERSION: '2.4.1', LOGVAULT_BUILD: 'release-20401' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('LogVault 2.4.1 (build release-20401)');
  });

  it('renderiza a prévia sem executar alterações', () => {
    const result = run(['--preview'], { NO_COLOR: '1' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Assistente de instalação');
    expect(result.stdout).toMatch(/Versão \d+\.\d+\.\d+/);
    expect(result.stdout).toContain('Sistema LogVault');
    expect(result.stdout).toContain('Coletor local');
    expect(result.stdout).toContain('Datacenter B');
    expect(result.stdout).toContain('Atualizar LogVault');
    expect(result.stdout).not.toContain('\u001b[');
  });

  it('aplica a paleta Azul elétrico quando cores são forçadas', () => {
    const result = run(['--preview'], { FORCE_COLOR: '1', NO_COLOR: '' });
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

  it('seleciona o DC-B e encaminha suas opções ao assistente de standby', () => {
    const dryRun = run([
      '--dry-run', 'dc-b', '--argus-url', 'https://logs.example.com', '--prepare-only'
    ], { NO_COLOR: '1' });
    expect(dryRun.status, dryRun.stderr).toBe(0);
    expect(dryRun.stdout).toContain('install-dc-b.sh install');
    expect(dryRun.stdout).toContain('--argus-url https://logs.example.com --prepare-only');
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
    expect(result.stderr).toContain("informe 'system', 'collector', 'dc-b' ou 'update'");
  });
});
