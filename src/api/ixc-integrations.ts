import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { openSecret, sealSecret } from '../core/secret-box.js';
import { authenticateRequest } from './auth.js';
import { normalizeIxcBaseUrl, testIxcApi } from './ixc-client.js';
import type { AuthSession, ErpIntegrationRecord, PostgresRepository } from './postgres.js';

const provider = 'ixc';
const connectionStatusSchema = z.object({
  status: z.enum(['success', 'failed']),
  testedAt: z.string(),
  message: z.string(),
  resources: z.array(z.string()).default([])
});
const settingsSchema = z.object({
  version: z.literal(1).default(1),
  lastTest: connectionStatusSchema.nullable().default(null),
  updatedAt: z.string().nullable().default(null)
});
const saveSchema = z.object({
  baseUrl: z.string().trim().url().max(2048).superRefine((value, context) => {
    const url = new URL(value);
    if (url.protocol !== 'https:') context.addIssue({ code: z.ZodIssueCode.custom, message: 'Use uma URL HTTPS' });
    if (url.username || url.password || url.search || url.hash) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'URL IXC inválida' });
    }
    if (!url.pathname.replace(/\/+$/, '').endsWith('/webservice/v1')) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'A URL deve terminar em /webservice/v1' });
    }
  }),
  token: z.string().trim().max(2048).refine((value) => !value || /^\d+:[^\s]+$/.test(value), {
    message: 'Informe o token completo no formato ID:chave'
  }).default(''),
  enabled: z.boolean().default(false)
});
const targetSchema = z.object({ tenantId: z.string().uuid().optional() });

interface IxcSecrets { token: string }

function parseSettings(record: ErpIntegrationRecord | null) {
  return settingsSchema.parse(record?.settings ?? {});
}

function parseSecrets(record: ErpIntegrationRecord | null, encryptionKey: string): IxcSecrets {
  if (!record?.secretRef) return { token: '' };
  const parsed = JSON.parse(openSecret(record.secretRef, encryptionKey)) as Partial<IxcSecrets>;
  return { token: typeof parsed.token === 'string' ? parsed.token : '' };
}

function publicIntegration(record: ErpIntegrationRecord | null, encryptionKey: string) {
  const settings = parseSettings(record);
  const secrets = parseSecrets(record, encryptionKey);
  return {
    provider,
    configured: Boolean(record),
    enabled: record?.enabled ?? false,
    baseUrl: record?.baseUrl ?? '',
    tokenConfigured: Boolean(secrets.token),
    lastTest: settings.lastTest,
    updatedAt: settings.updatedAt
  };
}

function requireAdmin(session: AuthSession, reply: FastifyReply): boolean {
  if (session.role === 'admin') return true;
  void reply.code(403).send({ error: 'tenant_administrator_required' });
  return false;
}

function resolveTenant(session: AuthSession, query: unknown, reply: FastifyReply): string | null {
  const parsed = targetSchema.safeParse(query);
  if (!parsed.success) {
    void reply.code(400).send({ error: 'invalid_tenant_target' });
    return null;
  }
  const tenantId = parsed.data.tenantId ?? session.tenantId;
  if (tenantId !== session.tenantId && !session.platformAdmin) {
    void reply.code(403).send({ error: 'platform_administrator_required' });
    return null;
  }
  return tenantId;
}

function diagnostic(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/:\/\/[^/@\s]+:[^/@\s]+@/g, '://***@').replace(/\s+/g, ' ').slice(0, 500);
}

export function registerIxcIntegrationRoutes(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository;
  encryptionKey: string;
  tester?: typeof testIxcApi;
}): void {
  const loadTarget = async (request: Parameters<typeof authenticateRequest>[0], reply: FastifyReply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requireAdmin(session, reply)) return null;
    if (!await dependencies.postgres.isIntegrationProviderEnabled(provider)) {
      void reply.code(403).send({ error: 'integration_provider_unavailable' });
      return null;
    }
    const tenantId = resolveTenant(session, request.query, reply);
    return tenantId ? { session, tenantId } : null;
  };

  app.get('/v1/integrations/ixc', async (request, reply) => {
    const target = await loadTarget(request, reply);
    if (!target) return;
    const record = await dependencies.postgres.getErpIntegration(target.tenantId, provider);
    return reply.send({ integration: publicIntegration(record, dependencies.encryptionKey) });
  });

  app.put('/v1/integrations/ixc', async (request, reply) => {
    const target = await loadTarget(request, reply);
    if (!target) return;
    const parsed = saveSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_ixc_settings', details: parsed.error.flatten() });
    const existing = await dependencies.postgres.getErpIntegration(target.tenantId, provider);
    let previousSecrets: IxcSecrets;
    try {
      previousSecrets = parseSecrets(existing, dependencies.encryptionKey);
    } catch {
      return reply.code(500).send({ error: 'integration_secret_unreadable' });
    }
    const baseUrl = normalizeIxcBaseUrl(parsed.data.baseUrl);
    const secrets = { token: parsed.data.token || previousSecrets.token };
    if (!secrets.token) return reply.code(400).send({ error: 'integration_configuration_incomplete' });
    const old = parseSettings(existing);
    const changed = !existing || existing.baseUrl !== baseUrl || previousSecrets.token !== secrets.token;
    const settings = {
      version: 1 as const,
      lastTest: changed ? null : old.lastTest,
      updatedAt: new Date().toISOString()
    };
    if (parsed.data.enabled) {
      if (settings.lastTest?.status !== 'success') {
        return reply.code(409).send({ error: 'ixc_test_required' });
      }
      const elleven = await dependencies.postgres.getErpIntegration(target.tenantId, 'elleven');
      if (elleven?.enabled) return reply.code(409).send({ error: 'another_integration_active' });
    }
    const record = await dependencies.postgres.saveErpIntegration({
      tenantId: target.tenantId,
      provider,
      baseUrl,
      secretRef: sealSecret(JSON.stringify(secrets), dependencies.encryptionKey),
      settings,
      enabled: parsed.data.enabled
    });
    return reply.send({ integration: publicIntegration(record, dependencies.encryptionKey) });
  });

  app.post('/v1/integrations/ixc/test', async (request, reply) => {
    const target = await loadTarget(request, reply);
    if (!target) return;
    const record = await dependencies.postgres.getErpIntegration(target.tenantId, provider);
    if (!record) return reply.code(409).send({ error: 'integration_not_configured' });
    const settings = parseSettings(record);
    const secrets = parseSecrets(record, dependencies.encryptionKey);
    if (!record.baseUrl || !secrets.token) return reply.code(409).send({ error: 'integration_configuration_incomplete' });
    const testedAt = new Date().toISOString();
    try {
      const result = await (dependencies.tester ?? testIxcApi)({ baseUrl: record.baseUrl, token: secrets.token });
      settings.lastTest = {
        status: 'success', testedAt, message: 'API IXC validada com sucesso',
        resources: result.resources.map((item) => item.resource)
      };
      settings.updatedAt = testedAt;
      const saved = await dependencies.postgres.saveErpIntegration({ ...record, settings });
      return reply.send({
        status: 'success', testedAt, resources: result.resources,
        integration: publicIntegration(saved, dependencies.encryptionKey)
      });
    } catch (error) {
      const message = diagnostic(error);
      settings.lastTest = { status: 'failed', testedAt, message, resources: [] };
      settings.updatedAt = testedAt;
      const saved = await dependencies.postgres.saveErpIntegration({ ...record, enabled: false, settings });
      request.log.warn({ error, tenantId: target.tenantId }, 'Falha ao testar API IXC');
      return reply.code(502).send({
        error: 'ixc_test_failed', message, testedAt,
        integration: publicIntegration(saved, dependencies.encryptionKey)
      });
    }
  });

  app.delete('/v1/integrations/ixc', async (request, reply) => {
    const target = await loadTarget(request, reply);
    if (!target) return;
    const deleted = await dependencies.postgres.deleteErpIntegration(target.tenantId, provider);
    if (!deleted) return reply.code(404).send({ error: 'integration_not_configured' });
    return reply.code(204).send();
  });
}
