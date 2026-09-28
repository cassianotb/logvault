import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { hashPassword } from '../core/password.js';
import { sha256 } from '../core/crypto.js';
import { authenticateRequest as authenticateBaseRequest } from './auth.js';
import type { AuthSession, PlatformAuditAction, PlatformAuditEvent, PostgresRepository } from './postgres.js';
import type { ClickHouseRepository } from './clickhouse.js';
import { openSecret, sealSecret } from '../core/secret-box.js';
import { sendSmtpTestMessage, type SmtpPasswordResetMailerConfig } from '../core/password-reset-mailer.js';
import { companyProfilePayloadSchema, decodeCompanyLogo } from './company.js';

const planFields = {
  planCode: z.string().trim().min(1).max(100),
  deviceLimitOverride: z.number().int().min(1).max(10000).nullable().default(null)
};
const tenantTimezoneSchema = z.string().trim().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, 'Fuso horário inválido');
const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(200),
  timezone: tenantTimezoneSchema.default('America/Sao_Paulo'),
  ...planFields,
  adminName: z.string().trim().min(2).max(200),
  adminEmail: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  adminPassword: z.string().min(12).max(1024),
  companyProfile: companyProfilePayloadSchema.optional()
});
const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(200),
  timezone: tenantTimezoneSchema.optional(),
  active: z.boolean(),
  ...planFields
});
const tenantIdSchema = z.object({ tenantId: z.string().uuid() });
const tenantUserSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid()
});
const platformUserRoleSchema = z.enum(['admin', 'operator', 'auditor']);
const createPlatformTenantUserSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  role: platformUserRoleSchema,
  password: z.string().min(12).max(1024)
});
const updatePlatformTenantUserSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  role: platformUserRoleSchema,
  active: z.boolean()
});
const userPasswordSchema = z.object({
  password: z.string().min(12).max(1024)
});
const planCodeSchema = z.object({ planCode: z.string().min(1).max(100) });
const planBodySchema = z.object({
  name: z.string().trim().min(2).max(200),
  deviceLimit: z.number().int().min(1).max(10000).nullable()
});
const deleteTenantSchema = z.object({
  confirmation: z.string().min(1).max(200),
  acknowledgeBackupRetention: z.literal(true)
});
const deletionJobSchema = z.object({ jobId: z.string().uuid() });
const platformAuditActionSchema = z.enum([
  'created', 'updated', 'activated', 'deactivated', 'plan_changed', 'exported',
  'plan_created', 'plan_updated', 'plan_deleted',
  'tenant_deletion_requested', 'tenant_deleted', 'tenant_deletion_failed',
  'email_settings_updated', 'email_tested', 'company_profile_updated',
  'tenant_accessed', 'tenant_access_ended',
  'access_profile_created', 'access_profile_updated', 'access_profile_deleted',
  'integration_provider_enabled', 'integration_provider_disabled'
]);
const emailSettingsSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(255).refine((value) => !value || /^[A-Za-z0-9.-]+$/.test(value), 'Servidor SMTP inválido'),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().max(320).refine((value) => !/[\r\n]/.test(value), 'Usuário SMTP inválido'),
  password: z.string().max(1024).default(''),
  from: z.string().trim().max(320)
    .refine((value) => !/[\r\n]/.test(value), 'Remetente inválido')
    .refine((value) => {
      if (!value) return true;
      const address = /<([^<>]+)>$/.exec(value)?.[1] ?? value;
      return z.string().email().safeParse(address.trim()).success;
    }, 'Informe um e-mail ou Nome <email> válido')
}).refine((value) => !value.enabled || Boolean(value.host && value.from), {
  message: 'Servidor e remetente são obrigatórios quando o envio está ativo'
});
const emailTestSchema = z.object({
  recipient: z.string().trim().email().max(320).transform((value) => value.toLowerCase())
});
const platformAuditQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
  action: z.union([z.literal('all'), platformAuditActionSchema]).default('all'),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(20).max(500).default(100)
}).refine((value) => !value.from || !value.to || Date.parse(value.from) <= Date.parse(value.to), {
  message: 'Período inválido', path: ['to']
});

function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  postgres: PostgresRepository
) {
  return authenticateBaseRequest(request, reply, postgres, { allowPlatformContext: true });
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildPlatformAuditCsv(events: PlatformAuditEvent[]): Buffer {
  const header = ['Data e horário', 'Cliente', 'Administrador', 'E-mail', 'Ação', 'Detalhes', 'ID'];
  const lines = [header, ...events.map((event) => [
    event.createdAt,
    event.targetTenantName ?? 'Todos os clientes',
    event.actorName,
    event.actorEmail,
    event.action,
    JSON.stringify(event.details),
    event.id
  ])];
  return Buffer.from(`\ufeff${lines.map((line) => line.map(csvCell).join(';')).join('\r\n')}\r\n`, 'utf8');
}

function requirePlatformAdmin(session: AuthSession, reply: FastifyReply): boolean {
  if (session.platformAdmin) return true;
  void reply.code(403).send({ error: 'platform_administrator_required' });
  return false;
}

function postgresErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export async function startTenantDeletionProcessor(
  app: FastifyInstance,
  dependencies: {
    postgres: PostgresRepository;
    clickhouse: ClickHouseRepository;
    deleteStandbyTenantData?: (tenantId: string) => Promise<void>;
    backupRetentionDays: number;
    remoteBackupConfigured: boolean;
  }
): Promise<() => void> {
  let processing = false;
  let stopped = false;
  await dependencies.postgres.recoverInterruptedTenantDeletions();
  const processQueue = async () => {
    if (processing || stopped) return;
    processing = true;
    try {
      while (!stopped) {
        const job = await dependencies.postgres.claimNextTenantDeletion();
        if (!job) break;
        try {
          const deleted = await dependencies.clickhouse.deleteTenantData(job.tenantId);
          await dependencies.deleteStandbyTenantData?.(job.tenantId);
          await dependencies.postgres.completeTenantDeletion({
            jobId: job.id,
            ...deleted,
            backupRetentionDays: dependencies.backupRetentionDays,
            remoteBackupConfigured: dependencies.remoteBackupConfigured
          });
          app.log.info({ jobId: job.id, ...deleted }, 'Exclusão de tenant concluída');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await dependencies.postgres.failTenantDeletion(job.id, message);
          app.log.error({ jobId: job.id, error: message }, 'Exclusão de tenant falhou');
        }
      }
    } finally {
      processing = false;
    }
  };
  const timer = setInterval(() => void processQueue(), 5000);
  app.addHook('onClose', async () => {
    stopped = true;
    clearInterval(timer);
  });
  void processQueue();
  return () => void processQueue();
}

export function registerPlatformRoutes(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository;
  triggerTenantDeletion?: () => void;
  backupRetentionDays?: number;
  remoteBackupConfigured?: boolean;
  emailEncryptionKey?: string;
  fallbackEmailSettings?: SmtpPasswordResetMailerConfig;
  sendSmtpTest?: typeof sendSmtpTestMessage;
}): void {
  const emailEncryptionKey = dependencies.emailEncryptionKey ?? 'platform-email-test-key-material-32';
  const fallbackEmailSettings = dependencies.fallbackEmailSettings ?? {
    host: '', port: 587, secure: false, user: '', password: '', from: ''
  };
  const smtpTestSender = dependencies.sendSmtpTest ?? sendSmtpTestMessage;
  const effectiveEmailSettings = async () => {
    const stored = await dependencies.postgres.getPlatformEmailSettings();
    if (!stored) {
      return {
        enabled: Boolean(fallbackEmailSettings.host && fallbackEmailSettings.from),
        ...fallbackEmailSettings,
        passwordConfigured: Boolean(fallbackEmailSettings.password),
        lastTestAt: null,
        lastTestStatus: null,
        lastTestError: '',
        updatedAt: null,
        source: 'environment' as const
      };
    }
    return {
      enabled: stored.enabled,
      host: stored.host,
      port: stored.port,
      secure: stored.secure,
      user: stored.user,
      password: openSecret(stored.passwordSecret, emailEncryptionKey),
      from: stored.from,
      passwordConfigured: Boolean(stored.passwordSecret),
      lastTestAt: stored.lastTestAt,
      lastTestStatus: stored.lastTestStatus,
      lastTestError: stored.lastTestError,
      updatedAt: stored.updatedAt,
      source: 'platform' as const
    };
  };

  app.get('/v1/platform/email-settings', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const settings = await effectiveEmailSettings();
    const { password: _password, ...publicSettings } = settings;
    return reply.send({ settings: publicSettings });
  });

  app.put('/v1/platform/email-settings', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const parsed = emailSettingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_email_settings', details: parsed.error.flatten() });
    const current = await effectiveEmailSettings();
    const password = parsed.data.password || current.password;
    if (parsed.data.enabled && parsed.data.user && !password) {
      return reply.code(400).send({ error: 'smtp_password_required' });
    }
    const settings = await dependencies.postgres.savePlatformEmailSettings({
      actorUserId: session.id,
      enabled: parsed.data.enabled,
      host: parsed.data.host,
      port: parsed.data.port,
      secure: parsed.data.secure,
      user: parsed.data.user,
      passwordSecret: sealSecret(password, emailEncryptionKey),
      from: parsed.data.from,
      passwordChanged: Boolean(parsed.data.password)
    });
    const { passwordSecret, ...publicSettings } = settings;
    return reply.send({
      settings: {
        ...publicSettings,
        passwordConfigured: Boolean(passwordSecret),
        source: 'platform'
      }
    });
  });

  app.post('/v1/platform/email-settings/test', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const parsed = emailTestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_test_recipient' });
    const settings = await effectiveEmailSettings();
    if (!settings.host || !settings.from) return reply.code(409).send({ error: 'smtp_not_configured' });
    try {
      await smtpTestSender(settings, parsed.data.recipient);
      await dependencies.postgres.recordPlatformEmailTest({
        actorUserId: session.id, recipient: parsed.data.recipient, status: 'success', error: ''
      });
      return reply.send({ status: 'delivered' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await dependencies.postgres.recordPlatformEmailTest({
        actorUserId: session.id, recipient: parsed.data.recipient, status: 'failed', error: message
      });
      app.log.warn({ error, actorUserId: session.id }, 'Teste SMTP falhou');
      return reply.code(502).send({ error: 'smtp_test_failed', message: message.slice(0, 500) });
    }
  });

  app.get('/v1/platform/tenants', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const [tenants, plans] = await Promise.all([
      dependencies.postgres.listPlatformTenants(),
      dependencies.postgres.listServicePlans()
    ]);
    return reply.send({
      generatedAt: new Date().toISOString(),
      summary: {
        total: tenants.length,
        active: tenants.filter((tenant) => tenant.active).length,
        devices: tenants.reduce((total, tenant) => total + tenant.plan.devicesUsed, 0),
        collectors: tenants.reduce((total, tenant) => total + tenant.collectorCount, 0)
      },
      plans,
      deletionPolicy: {
        liveDataRemoved: true,
        localBackupRetentionDays: dependencies.backupRetentionDays ?? 35,
        remoteBackupConfigured: dependencies.remoteBackupConfigured ?? false
      },
      tenants
    });
  });

  app.post('/v1/platform/tenants', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const parsed = createTenantSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_tenant', details: parsed.error.flatten() });
    try {
      const profilePayload = parsed.data.companyProfile;
      const logo = decodeCompanyLogo(profilePayload?.logoDataUrl);
      const companyProfile = profilePayload ? {
        legalName: profilePayload.legalName,
        tradeName: profilePayload.tradeName,
        cnpj: profilePayload.cnpj,
        phone: profilePayload.phone,
        email: profilePayload.email,
        postalCode: profilePayload.postalCode,
        street: profilePayload.street,
        addressNumber: profilePayload.addressNumber,
        complement: profilePayload.complement,
        district: profilePayload.district,
        city: profilePayload.city,
        state: profilePayload.state
      } : undefined;
      const result = await dependencies.postgres.createPlatformTenant({
        actorUserId: session.id,
        name: parsed.data.name,
        timezone: parsed.data.timezone,
        planCode: parsed.data.planCode,
        deviceLimitOverride: parsed.data.deviceLimitOverride,
        adminName: parsed.data.adminName,
        adminEmail: parsed.data.adminEmail,
        adminPasswordHash: await hashPassword(parsed.data.adminPassword),
        ...(companyProfile ? { companyProfile } : {}),
        ...(logo.data && logo.mime ? { logoData: logo.data, logoMime: logo.mime } : {})
      });
      if (result.status === 'plan_not_found') return reply.code(400).send({ error: 'plan_not_found' });
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('invalid_logo')) {
        return reply.code(400).send({ error: error.message });
      }
      if (postgresErrorCode(error) === '23505') return reply.code(409).send({ error: 'email_already_exists' });
      throw error;
    }
  });

  app.put('/v1/platform/tenants/:tenantId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const params = tenantIdSchema.safeParse(request.params);
    const body = updateTenantSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_tenant_update' });
    if (params.data.tenantId === (session.homeTenantId ?? session.tenantId) && !body.data.active) {
      return reply.code(409).send({ error: 'cannot_deactivate_own_tenant' });
    }
    const result = await dependencies.postgres.updatePlatformTenant({
      actorUserId: session.id,
      tenantId: params.data.tenantId,
      name: body.data.name,
      active: body.data.active,
      planCode: body.data.planCode,
      deviceLimitOverride: body.data.deviceLimitOverride,
      ...(body.data.timezone ? { timezone: body.data.timezone } : {})
    });
    if (result.status === 'tenant_not_found') return reply.code(404).send({ error: 'tenant_not_found' });
    if (result.status === 'plan_not_found') return reply.code(400).send({ error: 'plan_not_found' });
    if (result.status === 'limit_below_usage') {
      return reply.code(409).send({ error: 'limit_below_usage', devicesUsed: result.devicesUsed });
    }
    return reply.send({ status: 'updated' });
  });

  app.get('/v1/platform/tenants/:tenantId/users', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const params = tenantIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_tenant_id' });
    return reply.send({ users: await dependencies.postgres.listUsers(params.data.tenantId) });
  });

  app.post('/v1/platform/tenants/:tenantId/users', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const params = tenantIdSchema.safeParse(request.params);
    const body = createPlatformTenantUserSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_user' });
    try {
      const user = await dependencies.postgres.createManagedUser({
        tenantId: params.data.tenantId,
        actorUserId: session.id,
        name: body.data.name,
        email: body.data.email,
        role: body.data.role,
        passwordHash: await hashPassword(body.data.password),
        platformAudit: true
      });
      return reply.code(201).send({ user });
    } catch (error) {
      if (postgresErrorCode(error) === '23505') return reply.code(409).send({ error: 'email_already_exists' });
      if (postgresErrorCode(error) === '23503') return reply.code(404).send({ error: 'tenant_not_found' });
      throw error;
    }
  });

  app.put('/v1/platform/tenants/:tenantId/users/:userId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const params = tenantUserSchema.safeParse(request.params);
    const body = updatePlatformTenantUserSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_user_update' });
    if (params.data.userId === session.id && (!body.data.active || body.data.role !== 'admin')) {
      return reply.code(409).send({ error: 'cannot_remove_own_admin_access' });
    }
    try {
      const result = await dependencies.postgres.updateManagedUser({
        tenantId: params.data.tenantId,
        actorUserId: session.id,
        targetUserId: params.data.userId,
        ...body.data,
        platformAudit: true
      });
      if (result === 'not_found') return reply.code(404).send({ error: 'user_not_found' });
      if (result === 'last_admin') return reply.code(409).send({ error: 'last_active_admin' });
      return reply.send({ status: 'updated' });
    } catch (error) {
      if (postgresErrorCode(error) === '23505') return reply.code(409).send({ error: 'email_already_exists' });
      throw error;
    }
  });

  app.delete('/v1/platform/tenants/:tenantId/users/:userId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const params = tenantUserSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_user_id' });
    if (params.data.userId === session.id) return reply.code(409).send({ error: 'cannot_delete_own_user' });
    const result = await dependencies.postgres.deleteManagedUser({
      tenantId: params.data.tenantId,
      actorUserId: session.id,
      targetUserId: params.data.userId,
      platformAudit: true
    });
    if (result === 'not_found') return reply.code(404).send({ error: 'user_not_found' });
    if (result === 'own_user') return reply.code(409).send({ error: 'cannot_delete_own_user' });
    if (result === 'last_admin') return reply.code(409).send({ error: 'last_active_admin' });
    return reply.send({ status: 'deleted' });
  });

  app.post('/v1/platform/tenants/:tenantId/users/:userId/reset-password', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const params = tenantUserSchema.safeParse(request.params);
    const body = userPasswordSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_password_reset' });
    const result = await dependencies.postgres.resetPlatformTenantAdministratorPassword({
      actorUserId: session.id,
      tenantId: params.data.tenantId,
      targetUserId: params.data.userId,
      passwordHash: await hashPassword(body.data.password)
    });
    if (result === 'not_found') return reply.code(404).send({ error: 'user_not_found' });
    return reply.send({ status: 'updated', sessionsRevoked: true });
  });

  // Compatibilidade com versões anteriores do painel.
  app.get('/v1/platform/tenants/:tenantId/administrators', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const params = tenantIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_tenant_id' });
    const users = await dependencies.postgres.listUsers(params.data.tenantId);
    return reply.send({ administrators: users.filter((user) => user.role === 'admin') });
  });

  app.post('/v1/platform/tenants/:tenantId/administrators/:userId/reset-password', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const params = tenantUserSchema.safeParse(request.params);
    const body = userPasswordSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_password_reset' });
    const result = await dependencies.postgres.resetPlatformTenantAdministratorPassword({
      actorUserId: session.id,
      tenantId: params.data.tenantId,
      targetUserId: params.data.userId,
      passwordHash: await hashPassword(body.data.password)
    });
    if (result === 'not_found') return reply.code(404).send({ error: 'administrator_not_found' });
    return reply.send({ status: 'updated', sessionsRevoked: true });
  });

  app.delete('/v1/platform/tenants/:tenantId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const params = tenantIdSchema.safeParse(request.params);
    const body = deleteTenantSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_tenant_deletion' });
    if (params.data.tenantId === (session.homeTenantId ?? session.tenantId)) {
      return reply.code(409).send({ error: 'cannot_delete_own_tenant' });
    }
    const result = await dependencies.postgres.requestTenantDeletion({
      actorUserId: session.id,
      tenantId: params.data.tenantId,
      confirmation: body.data.confirmation
    });
    if (result.status === 'tenant_not_found') return reply.code(404).send({ error: 'tenant_not_found' });
    if (result.status === 'confirmation_mismatch') {
      return reply.code(409).send({ error: 'tenant_confirmation_mismatch' });
    }
    if (result.status === 'already_queued') {
      return reply.code(202).send({ status: 'already_queued', jobId: result.jobId });
    }
    dependencies.triggerTenantDeletion?.();
    return reply.code(202).send({ status: 'queued', jobId: result.jobId });
  });

  app.post('/v1/platform/deletions/:jobId/retry', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const params = deletionJobSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_deletion_job' });
    const retried = await dependencies.postgres.retryTenantDeletion(params.data.jobId);
    if (!retried) return reply.code(404).send({ error: 'deletion_job_not_retryable' });
    dependencies.triggerTenantDeletion?.();
    return reply.send({ status: 'queued' });
  });

  app.get('/v1/platform/plans', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const plans = await dependencies.postgres.listServicePlans();
    return reply.send({ generatedAt: new Date().toISOString(), plans });
  });

  app.post('/v1/platform/plans', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const parsed = planBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_plan' });
    try {
      const plan = await dependencies.postgres.createServicePlan({ actorUserId: session.id, ...parsed.data });
      return reply.code(201).send({ plan });
    } catch (error) {
      if (postgresErrorCode(error) === '23505') return reply.code(409).send({ error: 'plan_name_already_exists' });
      throw error;
    }
  });

  app.put('/v1/platform/plans/:planCode', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const params = planCodeSchema.safeParse(request.params);
    const body = planBodySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_plan_update' });
    try {
      const result = await dependencies.postgres.updateServicePlan({
        actorUserId: session.id,
        code: params.data.planCode,
        ...body.data
      });
      if (result === 'not_found') return reply.code(404).send({ error: 'plan_not_found' });
      if (typeof result === 'object' && result.status === 'limit_below_usage') {
        return reply.code(409).send({ error: 'plan_limit_below_usage', devicesUsed: result.devicesUsed });
      }
      return reply.send({ status: 'updated' });
    } catch (error) {
      if (postgresErrorCode(error) === '23505') return reply.code(409).send({ error: 'plan_name_already_exists' });
      throw error;
    }
  });

  app.delete('/v1/platform/plans/:planCode', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const params = planCodeSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_plan_code' });
    const result = await dependencies.postgres.deleteServicePlan({ actorUserId: session.id, code: params.data.planCode });
    if (result === 'not_found') return reply.code(404).send({ error: 'plan_not_found' });
    if (result === 'plan_in_use') return reply.code(409).send({ error: 'plan_in_use' });
    if (result === 'last_active_plan') return reply.code(409).send({ error: 'last_active_plan' });
    return reply.send({ status: 'deleted' });
  });

  app.get('/v1/platform/audit', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const parsed = platformAuditQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_platform_audit_query' });
    const filters = {
      tenantId: parsed.data.tenantId ?? null,
      action: parsed.data.action === 'all' ? null : parsed.data.action as PlatformAuditAction,
      from: parsed.data.from ?? null,
      to: parsed.data.to ?? null,
      limit: parsed.data.limit
    };
    const [events, summary] = await Promise.all([
      dependencies.postgres.listPlatformAuditEvents(filters),
      dependencies.postgres.getPlatformAuditSummary()
    ]);
    return reply.send({ generatedAt: new Date().toISOString(), summary, events });
  });

  app.get('/v1/platform/audit/tenants', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const tenants = await dependencies.postgres.listPlatformTenants();
    return reply.send({ tenants: tenants.map((tenant) => ({ id: tenant.id, name: tenant.name })) });
  });

  app.get('/v1/platform/audit/export', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const parsed = platformAuditQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_platform_audit_export' });
    const filters = {
      tenantId: parsed.data.tenantId ?? null,
      action: parsed.data.action === 'all' ? null : parsed.data.action as PlatformAuditAction,
      from: parsed.data.from ?? null,
      to: parsed.data.to ?? null
    };
    const events = await dependencies.postgres.listPlatformAuditEvents({ ...filters, limit: 10000 });
    const report = buildPlatformAuditCsv(events);
    await dependencies.postgres.recordPlatformAuditExport({
      actorUserId: session.id,
      targetTenantId: filters.tenantId,
      filters,
      resultCount: events.length,
      sha256: sha256(report)
    });
    const date = new Date().toISOString().slice(0, 10);
    reply.header('content-disposition', `attachment; filename="auditoria-plataforma-${date}.csv"`);
    reply.type('text/csv; charset=utf-8');
    return reply.send(report);
  });
}
