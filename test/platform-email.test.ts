import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerPlatformRoutes } from '../src/api/platform.js';
import type { AuthSession, PlatformEmailSettings, PostgresRepository } from '../src/api/postgres.js';
import { openSecret, sealSecret } from '../src/core/secret-box.js';

const key = 'platform-email-encryption-key-material';
const session: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010',
  id: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000001',
  tenantName: 'Plataforma',
  tenantTimezone: 'America/Sao_Paulo',
  name: 'Administrador',
  email: 'admin@example.com',
  role: 'admin',
  platformAdmin: true,
  expiresAt: '2026-08-11T00:00:00.000Z'
};
const cookie = `argus_session=${'x'.repeat(32)}`;
const stored: PlatformEmailSettings = {
  enabled: true,
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'logvault@example.com',
  passwordSecret: sealSecret('smtp-secret', key),
  from: 'LogVault <logvault@example.com>',
  lastTestAt: null,
  lastTestStatus: null,
  lastTestError: '',
  updatedAt: '2026-08-10T18:00:00.000Z'
};

describe('SMTP da plataforma', () => {
  it('mostra o estado sem expor a senha salva', async () => {
    const postgres = {
      findActiveSession: async () => session,
      getPlatformEmailSettings: async () => stored
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerPlatformRoutes(app, { postgres, emailEncryptionKey: key });
    const response = await app.inject({ method: 'GET', url: '/v1/platform/email-settings', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().settings).toMatchObject({
      enabled: true, host: stored.host, passwordConfigured: true, source: 'platform'
    });
    expect(response.json().settings).not.toHaveProperty('password');
    expect(response.json().settings).not.toHaveProperty('passwordSecret');
    await app.close();
  });

  it('mantém a senha anterior quando o formulário é salvo em branco', async () => {
    const saves: Array<{ passwordSecret: string; passwordChanged: boolean }> = [];
    const postgres = {
      findActiveSession: async () => session,
      getPlatformEmailSettings: async () => stored,
      savePlatformEmailSettings: async (input: { passwordSecret: string; passwordChanged: boolean }) => {
        saves.push(input); return { ...stored, host: 'smtp2.example.com', passwordSecret: input.passwordSecret };
      }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerPlatformRoutes(app, { postgres, emailEncryptionKey: key });
    const response = await app.inject({
      method: 'PUT', url: '/v1/platform/email-settings', headers: { cookie },
      payload: { enabled: true, host: 'smtp2.example.com', port: 587, secure: false,
        user: 'logvault@example.com', password: '', from: 'LogVault <logvault@example.com>' }
    });
    expect(response.statusCode).toBe(200);
    expect(openSecret(saves[0]?.passwordSecret ?? '', key)).toBe('smtp-secret');
    expect(saves[0]?.passwordChanged).toBe(false);
    await app.close();
  });

  it('envia e audita uma mensagem de teste', async () => {
    const sender = vi.fn(async () => undefined);
    const tests: unknown[] = [];
    const postgres = {
      findActiveSession: async () => session,
      getPlatformEmailSettings: async () => stored,
      recordPlatformEmailTest: async (input: unknown) => { tests.push(input); }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerPlatformRoutes(app, { postgres, emailEncryptionKey: key, sendSmtpTest: sender });
    const response = await app.inject({
      method: 'POST', url: '/v1/platform/email-settings/test', headers: { cookie },
      payload: { recipient: 'destino@example.com' }
    });
    expect(response.statusCode).toBe(200);
    expect(sender).toHaveBeenCalledWith(expect.objectContaining({ password: 'smtp-secret' }), 'destino@example.com');
    expect(tests[0]).toMatchObject({ recipient: 'destino@example.com', status: 'success' });
    await app.close();
  });
});
