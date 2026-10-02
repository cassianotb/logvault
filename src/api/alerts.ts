import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { openSecret, sealSecret } from '../core/secret-box.js';
import { authenticateRequest } from './auth.js';
import type {
  AlertNotificationSettings,
  AlertDeliveryState,
  AlertSource,
  AuthSession,
  PostgresRepository
} from './postgres.js';
import type { OperationalAlert } from './system.js';

const alertSources = ['backup', 'collector', 'continuity', 'device', 'parser', 'spool', 'server'] as const;
const httpDestination = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}, 'Destino deve usar HTTP ou HTTPS');
const settingsSchema = z.object({
  enabled: z.boolean(),
  destinationType: z.enum(['generic', 'discord', 'telegram']),
  credential: z.string().trim().max(2048).default(''),
  telegramChatId: z.string().trim().max(128).default(''),
  minimumSeverity: z.enum(['warning', 'critical']),
  enabledSources: z.array(z.enum(alertSources)).min(1).max(alertSources.length),
  reminderMinutes: z.number().int().min(15).max(10080),
  recoveryEnabled: z.boolean()
});
const settingParamsSchema = z.object({ settingId: z.string().uuid() });

function requireAdmin(session: AuthSession, reply: FastifyReply): boolean {
  if (session.role === 'admin') return true;
  void reply.code(403).send({ error: 'administrator_required' });
  return false;
}

export interface WebhookMessage {
  event: 'test' | 'triggered' | 'reminder' | 'resolved';
  sentAt: string;
  tenant: { id: string; name: string };
  alert: { id: string; source: AlertSource | 'test'; severity: 'warning' | 'critical' | 'info'; title: string; detail: string };
}

function publicSettings(settings: AlertNotificationSettings, encryptionKey: string) {
  const { destinationSecret: _secret, ...safe } = settings;
  return {
    ...safe,
    credential: settings.destinationSecret ? openSecret(settings.destinationSecret, encryptionKey) : '',
    credentialConfigured: Boolean(settings.destinationSecret)
  };
}

function alertText(message: WebhookMessage): string {
  const icon = message.event === 'resolved' ? '✅' : message.alert.severity === 'critical' ? '🔴' : message.alert.severity === 'warning' ? '🟠' : '🔵';
  const event = { test: 'Teste', triggered: 'Novo alerta', reminder: 'Alerta permanece ativo', resolved: 'Normalizado' }[message.event];
  return `${icon} ${event} — ${message.alert.title}\n${message.alert.detail}\nCliente: ${message.tenant.name}\nHorário UTC: ${message.sentAt}`;
}

export async function sendAlertWebhook(
  webhookUrl: string,
  message: WebhookMessage,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: { 'content-type': 'application/json', 'user-agent': 'LogVault/1.0' },
    body: JSON.stringify(message)
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    throw new Error(`Webhook respondeu HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
}

export async function sendAlertDestination(
  settings: Pick<AlertNotificationSettings, 'destinationType' | 'telegramChatId'>,
  credential: string,
  message: WebhookMessage,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  if (settings.destinationType === 'generic') return sendAlertWebhook(credential, message, fetchImpl);
  const target = settings.destinationType === 'telegram'
    ? `https://api.telegram.org/bot${credential}/sendMessage` : credential;
  const body = settings.destinationType === 'discord' ? {
    username: 'LogVault', allowed_mentions: { parse: [] }, embeds: [{
      title: alertText(message).split('\n')[0], description: message.alert.detail,
      color: message.alert.severity === 'critical' ? 0xc83f49 : message.alert.severity === 'warning' ? 0xd88919 : 0x238b68,
      fields: [{ name: 'Cliente', value: message.tenant.name, inline: true }, { name: 'Origem', value: message.alert.source, inline: true }],
      timestamp: message.sentAt, footer: { text: `LogVault · ${message.event}` }
    }]
  } : { chat_id: settings.telegramChatId, text: alertText(message), disable_web_page_preview: true };
  const response = await fetchImpl(target, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { 'content-type': 'application/json', 'user-agent': 'LogVault/1.0' }, body: JSON.stringify(body)
  });
  const responseText = await response.text().catch(() => '');
  if (!response.ok) throw new Error(`${settings.destinationType} respondeu HTTP ${response.status}${responseText ? `: ${responseText.replace(/\s+/g, ' ').slice(0, 300)}` : ''}`);
  if (settings.destinationType === 'telegram' && responseText) {
    const result = JSON.parse(responseText) as { ok?: boolean; description?: string };
    if (result.ok === false) throw new Error(`Telegram recusou a mensagem: ${result.description ?? 'erro desconhecido'}`);
  }
}

export function registerAlertRoutes(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository;
  encryptionKey: string;
  fetchImpl?: typeof fetch;
}): void {
  app.get('/v1/system/alert-settings', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireAdmin(session, reply)) return;
    return reply.send({
      settings: (await dependencies.postgres.listAlertNotificationSettings(session.tenantId))
        .map((settings) => publicSettings(settings, dependencies.encryptionKey))
    });
  });

  app.post('/v1/system/alert-settings', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireAdmin(session, reply)) return;
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_alert_settings', details: parsed.error.flatten() });
    const existing = await dependencies.postgres.listAlertNotificationSettings(session.tenantId);
    if (existing.some((settings) => settings.destinationType === parsed.data.destinationType)) {
      return reply.code(409).send({ error: 'alert_destination_already_configured' });
    }
    const credential = parsed.data.credential;
    if (['generic', 'discord'].includes(parsed.data.destinationType) && credential && !httpDestination.safeParse(credential).success) {
      return reply.code(400).send({ error: 'invalid_alert_destination' });
    }
    if (parsed.data.destinationType === 'telegram' && credential && !/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(credential)) {
      return reply.code(400).send({ error: 'invalid_telegram_token' });
    }
    if (parsed.data.enabled && (!credential || parsed.data.destinationType === 'telegram' && !parsed.data.telegramChatId)) {
      return reply.code(400).send({ error: 'alert_destination_required' });
    }
    try {
      const settings = await dependencies.postgres.createAlertNotificationSetting({
        tenantId: session.tenantId, actorUserId: session.id, enabled: parsed.data.enabled,
        destinationType: parsed.data.destinationType,
        destinationSecret: credential ? sealSecret(credential, dependencies.encryptionKey) : '',
        telegramChatId: parsed.data.destinationType === 'telegram' ? parsed.data.telegramChatId : '',
        minimumSeverity: parsed.data.minimumSeverity, reminderMinutes: parsed.data.reminderMinutes,
        recoveryEnabled: parsed.data.recoveryEnabled, enabledSources: [...new Set(parsed.data.enabledSources)]
      });
      return reply.code(201).send({ settings: publicSettings(settings, dependencies.encryptionKey) });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'alert_destination_already_configured' });
      }
      throw error;
    }
  });

  app.put('/v1/system/alert-settings/:settingId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireAdmin(session, reply)) return;
    const params = settingParamsSchema.safeParse(request.params);
    const parsed = settingsSchema.safeParse(request.body);
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_alert_settings' });
    const existing = await dependencies.postgres.getAlertNotificationSetting(session.tenantId, params.data.settingId);
    if (!existing) return reply.code(404).send({ error: 'alert_destination_not_found' });
    if (existing.destinationType !== parsed.data.destinationType) {
      return reply.code(409).send({ error: 'alert_destination_type_immutable' });
    }
    const credential = parsed.data.credential || openSecret(existing.destinationSecret, dependencies.encryptionKey);
    if (['generic', 'discord'].includes(parsed.data.destinationType) && credential && !httpDestination.safeParse(credential).success) {
      return reply.code(400).send({ error: 'invalid_alert_destination' });
    }
    if (parsed.data.destinationType === 'telegram' && credential && !/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(credential)) {
      return reply.code(400).send({ error: 'invalid_telegram_token' });
    }
    if (parsed.data.enabled && (!credential || parsed.data.destinationType === 'telegram' && !parsed.data.telegramChatId)) {
      return reply.code(400).send({ error: 'alert_destination_required' });
    }
    const settings = await dependencies.postgres.updateAlertNotificationSetting({
      id: existing.id, tenantId: session.tenantId, actorUserId: session.id, enabled: parsed.data.enabled,
      destinationType: existing.destinationType,
      destinationSecret: credential ? sealSecret(credential, dependencies.encryptionKey) : '',
      telegramChatId: existing.destinationType === 'telegram' ? parsed.data.telegramChatId : '',
      minimumSeverity: parsed.data.minimumSeverity, reminderMinutes: parsed.data.reminderMinutes,
      recoveryEnabled: parsed.data.recoveryEnabled, enabledSources: [...new Set(parsed.data.enabledSources)]
    });
    if (!settings) return reply.code(404).send({ error: 'alert_destination_not_found' });
    return reply.send({ settings: publicSettings(settings, dependencies.encryptionKey) });
  });

  app.delete('/v1/system/alert-settings/:settingId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireAdmin(session, reply)) return;
    const params = settingParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_alert_destination_id' });
    const deleted = await dependencies.postgres.deleteAlertNotificationSetting(session.tenantId, params.data.settingId);
    if (!deleted) return reply.code(404).send({ error: 'alert_destination_not_found' });
    return reply.code(204).send();
  });

  app.post('/v1/system/alert-settings/:settingId/test', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireAdmin(session, reply)) return;
    const params = settingParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_alert_destination_id' });
    const settings = await dependencies.postgres.getAlertNotificationSetting(session.tenantId, params.data.settingId);
    if (!settings) return reply.code(404).send({ error: 'alert_destination_not_found' });
    if (!settings.destinationSecret) return reply.code(409).send({ error: 'destination_not_configured' });
    try {
      await sendAlertDestination(settings, openSecret(settings.destinationSecret, dependencies.encryptionKey), {
        event: 'test', sentAt: new Date().toISOString(),
        tenant: { id: settings.tenantId, name: settings.tenantName },
        alert: { id: 'test', source: 'test', severity: 'info', title: 'Teste de notificações LogVault', detail: 'O webhook foi configurado corretamente.' }
      }, dependencies.fetchImpl ?? fetch);
      await dependencies.postgres.recordAlertWebhookTest(session.tenantId, settings.id, 'success', '');
      return reply.send({ status: 'sent', testedAt: new Date().toISOString() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await dependencies.postgres.recordAlertWebhookTest(session.tenantId, settings.id, 'failed', message);
      return reply.code(502).send({ error: 'webhook_test_failed', message });
    }
  });
}

function acceptsAlert(settings: AlertNotificationSettings, alert: OperationalAlert): boolean {
  return settings.enabledSources.includes(alert.source)
    && (settings.minimumSeverity === 'warning' || alert.severity === 'critical');
}

export function alertNotificationEvent(
  settings: AlertNotificationSettings,
  state: AlertDeliveryState | undefined,
  nowMs = Date.now()
): 'triggered' | 'reminder' | null {
  if (!state || !state.active) return 'triggered';
  const lastNotifiedMs = state.lastNotifiedAt ? Date.parse(state.lastNotifiedAt) : Number.NaN;
  return !Number.isFinite(lastNotifiedMs) || nowMs - lastNotifiedMs >= settings.reminderMinutes * 60_000
    ? 'reminder' : null;
}

export function startAlertProcessor(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository;
  encryptionKey: string;
  evaluate: (tenantId: string) => Promise<OperationalAlert[]>;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
}): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const settings of await dependencies.postgres.listEnabledAlertNotificationSettings()) {
        try {
          const credential = openSecret(settings.destinationSecret, dependencies.encryptionKey);
          const now = new Date();
          const observedAt = now.toISOString();
          const allAlerts = await dependencies.evaluate(settings.tenantId);
          const currentById = new Map(allAlerts.map((alert) => [alert.id, alert]));
          const dismissalSupported = typeof dependencies.postgres.reconcileAlertDismissals === 'function'
            && typeof dependencies.postgres.listActiveAlertDismissals === 'function';
          if (dismissalSupported) await dependencies.postgres.reconcileAlertDismissals(settings.tenantId, [...currentById.keys()]);
          const dismissed = new Set(dismissalSupported
            ? await dependencies.postgres.listActiveAlertDismissals(settings.tenantId) : []);
          const states = await dependencies.postgres.listAlertDeliveryStates(settings.tenantId, settings.id);
          const statesById = new Map(states.map((state) => [state.alertId, state]));

          for (const alert of allAlerts.filter((candidate) => acceptsAlert(settings, candidate) && !dismissed.has(candidate.id))) {
            const state = statesById.get(alert.id);
            const event = alertNotificationEvent(settings, state, now.getTime());
            let notifiedAt: string | null = null;
            if (event) {
              try {
                await sendAlertDestination(settings, credential, {
                  event, sentAt: observedAt,
                  tenant: { id: settings.tenantId, name: settings.tenantName }, alert
                }, dependencies.fetchImpl ?? fetch);
                notifiedAt = observedAt;
              } catch (error) {
                app.log.warn({ error, tenantId: settings.tenantId, alertId: alert.id }, 'Falha ao enviar alerta externo');
              }
            }
            await dependencies.postgres.saveActiveAlertState({
              tenantId: settings.tenantId, settingId: settings.id, alert, observedAt, notifiedAt
            });
          }

          for (const state of states.filter((candidate) => candidate.active && !currentById.has(candidate.alertId))) {
            let notifiedAt: string | null = null;
            if (settings.recoveryEnabled && settings.enabledSources.includes(state.source)) {
              try {
                await sendAlertDestination(settings, credential, {
                  event: 'resolved', sentAt: observedAt,
                  tenant: { id: settings.tenantId, name: settings.tenantName },
                  alert: { id: state.alertId, source: state.source, severity: 'info', title: `${state.title}: normalizado`, detail: `Alerta resolvido. ${state.detail}` }
                }, dependencies.fetchImpl ?? fetch);
                notifiedAt = observedAt;
              } catch (error) {
                app.log.warn({ error, tenantId: settings.tenantId, alertId: state.alertId }, 'Falha ao enviar recuperação externa');
                continue;
              }
            }
            await dependencies.postgres.resolveAlertState(
              settings.tenantId, settings.id, state.alertId, observedAt, notifiedAt
            );
          }
        } catch (error) {
          app.log.warn({ error, tenantId: settings.tenantId }, 'Falha ao avaliar notificações do cliente');
        }
      }
    } catch (error) {
      app.log.warn({ error }, 'Falha ao listar configurações de alertas');
    } finally {
      running = false;
    }
  };
  const initial = setTimeout(() => void tick(), 5_000);
  initial.unref();
  const timer = setInterval(() => void tick(), dependencies.intervalMs ?? 60_000);
  timer.unref();
  return () => { clearTimeout(initial); clearInterval(timer); };
}
