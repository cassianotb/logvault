import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerAuthRoutes } from '../src/api/auth.js';
import type { AuthUser, PostgresRepository } from '../src/api/postgres.js';
import { sha256 } from '../src/core/crypto.js';
import type { PasswordResetMailer } from '../src/core/password-reset-mailer.js';
import { verifyPassword } from '../src/core/password.js';

const user: AuthUser = {
  id: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000001',
  tenantName: 'ISP Teste',
  tenantTimezone: 'America/Sao_Paulo',
  name: 'Administrador',
  email: 'admin@example.com',
  role: 'admin',
  platformAdmin: false,
  passwordHash: 'hash-anterior'
};

function register(postgres: PostgresRepository, mailer: PasswordResetMailer) {
  const app = Fastify();
  registerAuthRoutes(app, {
    postgres,
    sessionTtlHours: 12,
    cookieSecure: false,
    passwordResetTtlMinutes: 30,
    publicUrl: 'https://logvault.example.com/',
    passwordResetMailer: mailer
  });
  return app;
}

describe('recuperação de senha', () => {
  it('informa quando o envio por e-mail ainda não está configurado', async () => {
    const find = vi.fn();
    const app = register({ findActiveUsersByEmail: find } as unknown as PostgresRepository, {
      isConfigured: async () => false,
      send: vi.fn()
    });
    const response = await app.inject({ method: 'POST', url: '/v1/auth/password-recovery', payload: { email: user.email } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'password_recovery_unavailable' });
    expect(find).not.toHaveBeenCalled();
    await app.close();
  });

  it('não revela se o e-mail existe e envia link com token armazenado somente como hash', async () => {
    const created: Array<{ tokenHash: string }> = [];
    const sent: Array<{ resetUrl: string }> = [];
    const postgres = {
      findActiveUsersByEmail: async (email: string) => email === user.email ? [user] : [],
      createPasswordResetToken: async (input: { tokenHash: string }) => { created.push(input); },
      discardPasswordResetToken: vi.fn()
    } as unknown as PostgresRepository;
    const mailer: PasswordResetMailer = {
      isConfigured: async () => true,
      send: async (message) => { sent.push(message); }
    };
    const app = register(postgres, mailer);

    const existing = await app.inject({ method: 'POST', url: '/v1/auth/password-recovery', payload: { email: user.email } });
    const absent = await app.inject({ method: 'POST', url: '/v1/auth/password-recovery', payload: { email: 'ausente@example.com' } });
    expect(existing.statusCode).toBe(202);
    expect(absent.statusCode).toBe(202);
    expect(existing.json()).toEqual(absent.json());
    const token = sent[0]?.resetUrl.split('/').at(-1);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created[0]?.tokenHash).toBe(sha256(token ?? ''));
    expect(sent[0]?.resetUrl).toMatch(/^https:\/\/logvault\.example\.com\/#reset-password\//);
    await app.close();
  });

  it('troca a senha com token válido e rejeita token expirado', async () => {
    const resets: Array<{ tokenHash: string; passwordHash: string }> = [];
    const postgres = {
      resetPasswordWithToken: async (input: { tokenHash: string; passwordHash: string }) => {
        resets.push(input);
        return input.tokenHash === sha256('a'.repeat(43));
      }
    } as unknown as PostgresRepository;
    const app = register(postgres, { isConfigured: async () => true, send: vi.fn() });
    const valid = await app.inject({
      method: 'POST', url: '/v1/auth/password-reset',
      payload: { token: 'a'.repeat(43), newPassword: 'nova-senha-segura-123' }
    });
    const invalid = await app.inject({
      method: 'POST', url: '/v1/auth/password-reset',
      payload: { token: 'b'.repeat(43), newPassword: 'outra-senha-segura-456' }
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toEqual({ status: 'password_reset', loginRequired: true });
    expect(await verifyPassword('nova-senha-segura-123', resets[0]?.passwordHash ?? '')).toBe(true);
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: 'reset_token_invalid_or_expired' });
    await app.close();
  });
});
