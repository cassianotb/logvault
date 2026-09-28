import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { alertNotificationEvent, registerAlertRoutes, sendAlertDestination, sendAlertWebhook } from '../src/api/alerts.js';
import type { AlertDeliveryState, AlertNotificationSettings, AuthSession, PostgresRepository } from '../src/api/postgres.js';
import { sealSecret } from '../src/core/secret-box.js';

const session: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010', id: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000001', tenantName: 'ISP Teste',
  name: 'Administrador', email: 'admin@example.com', role: 'admin', platformAdmin: false,
  expiresAt: '2026-08-11T00:00:00.000Z'
};
const cookie = `argus_session=${'x'.repeat(32)}`;
const settings: AlertNotificationSettings = {
  id: '30000000-0000-4000-8000-000000000001',
  tenantId: session.tenantId, tenantName: session.tenantName, enabled: false,
  destinationType: 'generic', destinationSecret: '', telegramChatId: '', minimumSeverity: 'critical',
  enabledSources: ['backup', 'collector', 'device', 'parser', 'spool', 'server'],
  reminderMinutes: 60, recoveryEnabled: true, lastTestAt: null, lastTestStatus: null,
  lastTestError: '', updatedAt: null
};

describe('webhook de alertas', () => {
  it('deduplica ocorrências ativas até o intervalo de repetição', () => {
    const state: AlertDeliveryState = {
      notificationSettingId: settings.id,
      alertId: 'device:1:offline', source: 'device', severity: 'critical', title: 'Offline', detail: 'Sem logs',
      active: true, firstSeenAt: '2026-08-10T12:00:00.000Z', lastSeenAt: '2026-08-10T12:30:00.000Z',
      lastNotifiedAt: '2026-08-10T12:30:00.000Z', resolvedAt: null
    };
    expect(alertNotificationEvent(settings, undefined, Date.parse('2026-08-10T13:00:00Z'))).toBe('triggered');
    expect(alertNotificationEvent(settings, state, Date.parse('2026-08-10T13:00:00Z'))).toBeNull();
    expect(alertNotificationEvent(settings, state, Date.parse('2026-08-10T13:30:00Z'))).toBe('reminder');
  });

  it('envia JSON identificável e rejeita respostas sem sucesso', async () => {
    const accepted = vi.fn(async () => new Response(null, { status: 204 }));
    await sendAlertWebhook('https://hooks.example.test/argus', {
      event: 'test', sentAt: '2026-08-10T15:00:00.000Z',
      tenant: { id: session.tenantId, name: session.tenantName },
      alert: { id: 'test', source: 'test', severity: 'info', title: 'Teste', detail: 'OK' }
    }, accepted as typeof fetch);
    expect(accepted).toHaveBeenCalledOnce();
    const request = accepted.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({ event: 'test', tenant: { name: 'ISP Teste' } });

    await expect(sendAlertWebhook('https://hooks.example.test/argus', {
      event: 'test', sentAt: '2026-08-10T15:00:00.000Z', tenant: { id: session.tenantId, name: session.tenantName },
      alert: { id: 'test', source: 'test', severity: 'info', title: 'Teste', detail: 'OK' }
    }, async () => new Response('recusado', { status: 500 }))).rejects.toThrow('HTTP 500');
  });

  it('formata Discord e Telegram nos contratos nativos', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const sender = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([String(url), init]);
      return String(url).includes('telegram')
        ? new Response(JSON.stringify({ ok: true }), { status: 200 }) : new Response(null, { status: 204 });
    };
    const message = { event: 'triggered' as const, sentAt: '2026-08-10T15:00:00.000Z',
      tenant: { id: session.tenantId, name: session.tenantName },
      alert: { id: 'device:1', source: 'device' as const, severity: 'critical' as const, title: 'A10 offline', detail: 'Sem logs' } };
    await sendAlertDestination({ destinationType: 'discord', telegramChatId: '' }, 'https://discord.com/api/webhooks/1/token', message, sender as typeof fetch);
    await sendAlertDestination({ destinationType: 'telegram', telegramChatId: '-100123' }, '123456:abcdefghijklmnopqrstuvwxyz', message, sender as typeof fetch);
    expect(JSON.parse(String(calls[0]?.[1]?.body)).embeds[0]).toMatchObject({ description: 'Sem logs' });
    expect(calls[1]?.[0]).toContain('/bot123456:abcdefghijklmnopqrstuvwxyz/sendMessage');
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toMatchObject({ chat_id: '-100123' });
  });

  it('permite cadastrar canais independentes e testar um destino específico', async () => {
    const saves: unknown[] = [];
    const tests: unknown[] = [];
    const configured: AlertNotificationSettings[] = [];
    const postgres = {
      findActiveSession: async () => session,
      listAlertNotificationSettings: async () => configured,
      getAlertNotificationSetting: async (_tenantId: string, settingId: string) => configured.find((item) => item.id === settingId) ?? null,
      createAlertNotificationSetting: async (input: { destinationType: 'generic' | 'discord' | 'telegram'; destinationSecret: string }) => {
        saves.push(input);
        const created = {
          ...settings,
          id: `30000000-0000-4000-8000-00000000000${configured.length + 2}`,
          enabled: true,
          destinationType: input.destinationType,
          destinationSecret: input.destinationSecret
        };
        configured.push(created);
        return created;
      },
      recordAlertWebhookTest: async (...input: unknown[]) => { tests.push(input); }
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerAlertRoutes(app, { postgres, encryptionKey: 'x'.repeat(32), fetchImpl: async () => new Response(null, { status: 204 }) });
    const response = await app.inject({
      method: 'POST', url: '/v1/system/alert-settings', headers: { cookie },
      payload: { enabled: true, destinationType: 'generic', credential: 'https://hooks.example.test/argus', telegramChatId: '', minimumSeverity: 'warning', enabledSources: ['device', 'backup'], reminderMinutes: 30, recoveryEnabled: true }
    });
    expect(response.statusCode).toBe(201);
    const discord = await app.inject({
      method: 'POST', url: '/v1/system/alert-settings', headers: { cookie },
      payload: { enabled: true, destinationType: 'discord', credential: 'https://discord.com/api/webhooks/1/token', telegramChatId: '', minimumSeverity: 'critical', enabledSources: ['server'], reminderMinutes: 60, recoveryEnabled: true }
    });
    expect(discord.statusCode).toBe(201);
    expect(configured.map((item) => item.destinationType)).toEqual(['generic', 'discord']);
    expect(saves[0]).toMatchObject({ tenantId: session.tenantId, actorUserId: session.id, enabled: true });
    const tested = await app.inject({ method: 'POST', url: `/v1/system/alert-settings/${configured[1]?.id}/test`, headers: { cookie } });
    expect(tested.statusCode).toBe(200);
    expect(tests[0]).toEqual([session.tenantId, configured[1]?.id, 'success', '']);
    await app.close();
  });

  it('mostra a credencial completa somente na rota administrativa', async () => {
    const encryptionKey = 'k'.repeat(32);
    const postgres = {
      findActiveSession: async () => session,
      listAlertNotificationSettings: async () => [{
        ...settings, destinationType: 'telegram', destinationSecret: sealSecret('123456:abcdefghijklmnopqrstuvwxyz', encryptionKey),
        telegramChatId: '-100123456'
      }]
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerAlertRoutes(app, { postgres, encryptionKey });
    const response = await app.inject({ method: 'GET', url: '/v1/system/alert-settings', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().settings[0]).toMatchObject({
      credential: '123456:abcdefghijklmnopqrstuvwxyz', telegramChatId: '-100123456', credentialConfigured: true
    });
    expect(response.json().settings[0]).not.toHaveProperty('destinationSecret');
    await app.close();
  });

  it('bloqueia configuração ativa sem destino e usuários não administradores', async () => {
    const postgres = {
      findActiveSession: async () => ({ ...session, role: 'operator' })
    } as unknown as PostgresRepository;
    const app = Fastify();
    registerAlertRoutes(app, { postgres, encryptionKey: 'x'.repeat(32) });
    const denied = await app.inject({ method: 'GET', url: '/v1/system/alert-settings', headers: { cookie } });
    expect(denied.statusCode).toBe(403);
    await app.close();
  });
});
