import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sha256 } from '../core/crypto.js';
import { hashPassword, verifyPassword } from '../core/password.js';
import type { PasswordResetMailer } from '../core/password-reset-mailer.js';
import type { AuthSession, PostgresRepository } from './postgres.js';
import { authorizePlatformRoute, hasPlatformAccess } from './access-control.js';

const COOKIE_NAME = 'argus_session';
const loginSchema = z.object({
  email: z.string().email().max(320).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(1024)
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(12).max(1024)
}).refine((value) => value.currentPassword !== value.newPassword, {
  message: 'A nova senha deve ser diferente',
  path: ['newPassword']
});
const requestPasswordResetSchema = z.object({
  email: z.string().email().max(320).transform((value) => value.trim().toLowerCase())
});
const resetPasswordSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{40,128}$/),
  newPassword: z.string().min(12).max(1024)
});
const tenantContextSchema = z.object({ tenantId: z.string().uuid().nullable() });
const attempts = new Map<string, { count: number; resetAt: number }>();
const passwordResetAttempts = new Map<string, { count: number; resetAt: number }>();
const dummyHash = hashPassword(randomBytes(24).toString('base64url'));

function clientMetadata(request: FastifyRequest): { ipAddress: string | null; userAgent: string } {
  return {
    ipAddress: request.ip || null,
    userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : ''
  };
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
    ...(secure ? ['Secure'] : [])
  ].join('; ');
}

function clearCookie(secure: boolean): string {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    ...(secure ? ['Secure'] : [])
  ].join('; ');
}

function publicSession(session: AuthSession) {
  return {
    id: session.id,
    name: session.name,
    email: session.email,
    role: session.role,
    platformAdmin: session.platformAdmin,
    platformOwner: session.platformOwner ?? false,
    accessProfile: session.platformAdmin ? {
      id: session.platformAccessProfileId ?? null,
      name: session.platformOwner ? 'Administrador principal' : session.platformAccessProfileName ?? 'Sem perfil',
      permissions: session.platformPermissions ?? null
    } : null,
    context: session.context,
    tenant: session.context === 'tenant'
      ? { id: session.tenantId, name: session.tenantName, timezone: session.tenantTimezone }
      : null,
    homeTenant: {
      id: session.homeTenantId,
      name: session.homeTenantName,
      timezone: session.homeTenantTimezone
    },
    expiresAt: session.expiresAt
  };
}

export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  postgres: PostgresRepository,
  options: { allowPlatformContext?: boolean } = {}
): Promise<AuthSession | undefined> {
  const token = cookieValue(request.headers.cookie, COOKIE_NAME);
  if (!token || token.length < 32 || token.length > 256) {
    await reply.code(401).send({ error: 'authentication_required' });
    return undefined;
  }
  const session = await postgres.findActiveSession(sha256(token));
  if (!session) {
    await reply.code(401).send({ error: 'session_expired' });
    return undefined;
  }
  if (session.context === 'platform' && !options.allowPlatformContext) {
    await reply.code(409).send({ error: 'tenant_context_required' });
    return undefined;
  }
  if (!authorizePlatformRoute(request, reply, session)) return undefined;
  return session;
}

export async function ensureBootstrapAdmin(postgres: PostgresRepository, input: {
  tenantId: string;
  name: string;
  email: string;
  password: string;
}): Promise<boolean> {
  if (await postgres.userEmailExists(input.tenantId, input.email)) return false;
  return postgres.createBootstrapUser({
    tenantId: input.tenantId,
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password)
  });
}

export function registerAuthRoutes(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository;
  sessionTtlHours: number;
  cookieSecure: boolean;
  passwordResetTtlMinutes: number;
  publicUrl: string;
  passwordResetMailer: PasswordResetMailer;
}): void {
  app.post('/v1/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_credentials' });
    const credentials = parsed.data;
    const metadata = clientMetadata(request);
    const rateKey = `${metadata.ipAddress ?? 'unknown'}:${credentials.email}`;
    const now = Date.now();
    const current = attempts.get(rateKey);
    const attempt = !current || current.resetAt <= now ? { count: 0, resetAt: now + 5 * 60_000 } : current;
    if (attempt.count >= 5) {
      reply.header('retry-after', String(Math.max(1, Math.ceil((attempt.resetAt - now) / 1000))));
      return reply.code(429).send({ error: 'too_many_attempts' });
    }

    const users = await dependencies.postgres.findActiveUsersByEmail(credentials.email);
    const user = users.length === 1 ? users[0] : undefined;
    const valid = user
      ? await verifyPassword(credentials.password, user.passwordHash)
      : await verifyPassword(credentials.password, await dummyHash);
    if (!valid || !user) {
      attempt.count += 1;
      attempts.set(rateKey, attempt);
      await dependencies.postgres.auditAuth({
        tenantId: user?.tenantId ?? null,
        userId: user?.id ?? null,
        email: credentials.email,
        action: 'login_failure',
        ...metadata
      });
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    attempts.delete(rateKey);
    const token = randomBytes(32).toString('base64url');
    const ttlSeconds = dependencies.sessionTtlHours * 60 * 60;
    const session = await dependencies.postgres.createSession({
      user,
      tokenHash: sha256(token),
      expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
      ...metadata
    });
    await dependencies.postgres.auditAuth({
      tenantId: user.tenantId,
      userId: user.id,
      email: user.email,
      action: 'login_success',
      ...metadata
    });
    reply.header('set-cookie', sessionCookie(token, ttlSeconds, dependencies.cookieSecure));
    return reply.send({ user: publicSession(session) });
  });

  app.get('/v1/auth/me', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    return { user: publicSession(session) };
  });

  app.post('/v1/auth/context', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (!session.platformAdmin) return reply.code(403).send({ error: 'platform_administrator_required' });
    const parsed = tenantContextSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_tenant_context' });
    if (parsed.data.tenantId !== null && !hasPlatformAccess(session, 'clients', 'manage')) {
      return reply.code(403).send({ error: 'platform_permission_required', module: 'clients', level: 'manage' });
    }
    const result = await dependencies.postgres.setPlatformSessionTenantContext({
      sessionId: session.sessionId,
      actorUserId: session.id,
      tenantId: parsed.data.tenantId
    });
    if (result === 'tenant_not_found') return reply.code(404).send({ error: 'tenant_not_found' });
    if (result === 'forbidden') return reply.code(403).send({ error: 'platform_administrator_required' });
    return reply.send({ status: 'updated' });
  });

  app.post('/v1/auth/logout', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    await dependencies.postgres.revokeSession(session.sessionId);
    await dependencies.postgres.auditAuth({
      tenantId: session.homeTenantId,
      userId: session.id,
      email: session.email,
      action: 'logout',
      ...clientMetadata(request)
    });
    reply.header('set-cookie', clearCookie(dependencies.cookieSecure));
    return { status: 'logged_out' };
  });

  app.post('/v1/auth/change-password', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_password', details: parsed.error.flatten() });
    const user = await dependencies.postgres.findActiveUserById(session.homeTenantId, session.id);
    if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      return reply.code(400).send({ error: 'current_password_invalid' });
    }
    const updated = await dependencies.postgres.updateOwnPassword(
      session.id,
      session.homeTenantId,
      await hashPassword(parsed.data.newPassword)
    );
    if (!updated) return reply.code(409).send({ error: 'password_not_changed' });
    await dependencies.postgres.auditAuth({
      tenantId: session.homeTenantId,
      userId: session.id,
      email: session.email,
      action: 'password_change',
      ...clientMetadata(request)
    });
    reply.header('set-cookie', clearCookie(dependencies.cookieSecure));
    return { status: 'password_changed', loginRequired: true };
  });

  app.post('/v1/auth/password-recovery', async (request, reply) => {
    const parsed = requestPasswordResetSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_email' });
    if (!(await dependencies.passwordResetMailer.isConfigured())) {
      return reply.code(503).send({ error: 'password_recovery_unavailable' });
    }

    const metadata = clientMetadata(request);
    const rateKey = `${metadata.ipAddress ?? 'unknown'}:${parsed.data.email}`;
    const now = Date.now();
    const current = passwordResetAttempts.get(rateKey);
    const attempt = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + 15 * 60_000 }
      : current;
    if (attempt.count >= 3) {
      return reply.code(202).send({ status: 'accepted' });
    }
    attempt.count += 1;
    passwordResetAttempts.set(rateKey, attempt);

    const users = await dependencies.postgres.findActiveUsersByEmail(parsed.data.email);
    const user = users.length === 1 ? users[0] : undefined;
    if (user) {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = sha256(token);
      const publicUrl = dependencies.publicUrl.replace(/\/+$/, '');
      try {
        await dependencies.postgres.createPasswordResetToken({
          user,
          tokenHash,
          expiresAt: new Date(now + dependencies.passwordResetTtlMinutes * 60_000).toISOString(),
          ...metadata
        });
        void dependencies.passwordResetMailer.send({
          email: user.email,
          name: user.name,
          resetUrl: `${publicUrl}/#reset-password/${token}`,
          expiresInMinutes: dependencies.passwordResetTtlMinutes
        }).catch(async (error) => {
          await dependencies.postgres.discardPasswordResetToken(tokenHash).catch(() => undefined);
          app.log.error({ error, userId: user.id }, 'Falha ao enviar recuperação de senha');
        });
      } catch (error) {
        app.log.error({ error, userId: user.id }, 'Falha ao criar recuperação de senha');
      }
    }
    return reply.code(202).send({ status: 'accepted' });
  });

  app.post('/v1/auth/password-reset', async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_reset' });
    const changed = await dependencies.postgres.resetPasswordWithToken({
      tokenHash: sha256(parsed.data.token),
      passwordHash: await hashPassword(parsed.data.newPassword),
      ...clientMetadata(request)
    });
    if (!changed) return reply.code(400).send({ error: 'reset_token_invalid_or_expired' });
    reply.header('set-cookie', clearCookie(dependencies.cookieSecure));
    return reply.send({ status: 'password_reset', loginRequired: true });
  });
}
