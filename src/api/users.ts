import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { hashPassword } from '../core/password.js';
import { authenticateRequest } from './auth.js';
import type { AuthSession, PostgresRepository } from './postgres.js';
import { normalizePlatformPermissions, platformAccessModules } from './access-control.js';

const roleSchema = z.enum(['admin', 'operator', 'auditor']);
const createUserSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  role: roleSchema,
  password: z.string().min(12).max(1024),
  accessProfileId: z.string().uuid().optional()
});
const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(200),
  role: roleSchema,
  active: z.boolean(),
  accessProfileId: z.string().uuid().optional()
});
const resetUserPasswordSchema = z.object({
  password: z.string().min(12).max(1024)
});
const userIdSchema = z.object({ userId: z.string().uuid() });
const profileIdSchema = z.object({ profileId: z.string().uuid() });
const permissionLevelSchema = z.enum(['none', 'view', 'manage']);
const profilePermissionsSchema = z.object(Object.fromEntries(
  platformAccessModules.map((module) => [module, permissionLevelSchema])
) as Record<(typeof platformAccessModules)[number], typeof permissionLevelSchema>);
const accessProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).default(''),
  permissions: profilePermissionsSchema
}).refine((value) => Object.values(value.permissions).some((level) => level !== 'none'), {
  message: 'O perfil deve permitir acesso a pelo menos um menu', path: ['permissions']
});

function requireAdmin(session: AuthSession, reply: FastifyReply): boolean {
  if (session.role === 'admin') return true;
  void reply.code(403).send({ error: 'administrator_required' });
  return false;
}

function postgresErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export function registerUserRoutes(app: FastifyInstance, dependencies: { postgres: PostgresRepository }): void {
  app.get('/v1/users', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requireAdmin(session, reply)) return;
    return reply.send({ users: await dependencies.postgres.listUsers(session.tenantId) });
  });

  app.post('/v1/users', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requireAdmin(session, reply)) return;
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_user', details: parsed.error.flatten() });
    const platformScope = session.context === 'platform';
    if (platformScope && parsed.data.role !== 'admin') {
      return reply.code(400).send({ error: 'invalid_platform_user_role' });
    }
    try {
      const user = await dependencies.postgres.createManagedUser({
        tenantId: session.tenantId,
        actorUserId: session.id,
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        passwordHash: await hashPassword(parsed.data.password),
        ...(platformScope ? {
          platformAudit: true,
          platformAdministrator: true,
          platformAccessProfileId: parsed.data.accessProfileId ?? '00000000-0000-4000-8000-000000000101'
        } : {})
      });
      return reply.code(201).send({ user });
    } catch (error) {
      if (postgresErrorCode(error) === '23505') return reply.code(409).send({ error: 'email_already_exists' });
      throw error;
    }
  });

  app.put('/v1/users/:userId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requireAdmin(session, reply)) return;
    const params = userIdSchema.safeParse(request.params);
    const body = updateUserSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_user_update' });
    const platformScope = session.context === 'platform';
    if (platformScope && body.data.role !== 'admin') {
      return reply.code(400).send({ error: 'invalid_platform_user_role' });
    }
    if (params.data.userId === session.id && (!body.data.active || body.data.role !== 'admin')) {
      return reply.code(409).send({ error: 'cannot_remove_own_admin_access' });
    }
    if (platformScope && params.data.userId !== session.id && await dependencies.postgres.isPlatformOwner(params.data.userId)) {
      return reply.code(409).send({ error: 'platform_owner_protected' });
    }
    if (platformScope && params.data.userId === session.id && body.data.accessProfileId
      && body.data.accessProfileId !== session.platformAccessProfileId) {
      return reply.code(409).send({ error: 'cannot_change_own_access_profile' });
    }
    const result = await dependencies.postgres.updateManagedUser({
      tenantId: session.tenantId,
      actorUserId: session.id,
      targetUserId: params.data.userId,
      ...body.data,
      ...(platformScope ? {
        platformAudit: true,
        ...(body.data.accessProfileId ? { platformAccessProfileId: body.data.accessProfileId } : {})
      } : {})
    });
    if (result === 'not_found') return reply.code(404).send({ error: 'user_not_found' });
    if (result === 'last_admin') return reply.code(409).send({ error: 'last_active_admin' });
    return reply.send({ status: 'updated' });
  });

  app.post('/v1/users/:userId/reset-password', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requireAdmin(session, reply)) return;
    const params = userIdSchema.safeParse(request.params);
    const body = resetUserPasswordSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_password_reset' });
    if (session.context === 'platform' && params.data.userId !== session.id
      && await dependencies.postgres.isPlatformOwner(params.data.userId)) {
      return reply.code(409).send({ error: 'platform_owner_protected' });
    }
    const result = await dependencies.postgres.resetPlatformTenantAdministratorPassword({
      actorUserId: session.id,
      tenantId: session.tenantId,
      targetUserId: params.data.userId,
      passwordHash: await hashPassword(body.data.password),
      platformAudit: session.context === 'platform'
    });
    if (result === 'not_found') return reply.code(404).send({ error: 'user_not_found' });
    return reply.send({ status: 'updated', sessionsRevoked: true });
  });

  app.delete('/v1/users/:userId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requireAdmin(session, reply)) return;
    const params = userIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_user_id' });
    if (params.data.userId === session.id) {
      return reply.code(409).send({ error: 'cannot_delete_own_user' });
    }
    if (session.context === 'platform' && await dependencies.postgres.isPlatformOwner(params.data.userId)) {
      return reply.code(409).send({ error: 'platform_owner_protected' });
    }
    const result = await dependencies.postgres.deleteManagedUser({
      tenantId: session.tenantId,
      actorUserId: session.id,
      targetUserId: params.data.userId,
      ...(session.context === 'platform' ? { platformAudit: true } : {})
    });
    if (result === 'not_found') return reply.code(404).send({ error: 'user_not_found' });
    if (result === 'own_user') return reply.code(409).send({ error: 'cannot_delete_own_user' });
    if (result === 'last_admin') return reply.code(409).send({ error: 'last_active_admin' });
    return reply.send({ status: 'deleted' });
  });

  app.get('/v1/platform/access-profiles', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requireAdmin(session, reply)) return;
    if (!session.platformAdmin) return reply.code(403).send({ error: 'platform_administrator_required' });
    return reply.send({ profiles: await dependencies.postgres.listPlatformAccessProfiles() });
  });

  app.post('/v1/platform/access-profiles', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requireAdmin(session, reply)) return;
    if (!session.platformAdmin) return reply.code(403).send({ error: 'platform_administrator_required' });
    const parsed = accessProfileSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_access_profile', details: parsed.error.flatten() });
    try {
      const profile = await dependencies.postgres.createPlatformAccessProfile({
        actorUserId: session.id,
        name: parsed.data.name,
        description: parsed.data.description,
        permissions: normalizePlatformPermissions(parsed.data.permissions)
      });
      return reply.code(201).send({ profile });
    } catch (error) {
      if (postgresErrorCode(error) === '23505') return reply.code(409).send({ error: 'access_profile_name_exists' });
      throw error;
    }
  });

  app.put('/v1/platform/access-profiles/:profileId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requireAdmin(session, reply)) return;
    if (!session.platformAdmin) return reply.code(403).send({ error: 'platform_administrator_required' });
    const params = profileIdSchema.safeParse(request.params);
    const body = accessProfileSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_access_profile' });
    if (!session.platformOwner && session.platformAccessProfileId === params.data.profileId) {
      return reply.code(409).send({ error: 'cannot_change_own_access_profile' });
    }
    try {
      const result = await dependencies.postgres.updatePlatformAccessProfile({
        actorUserId: session.id,
        profileId: params.data.profileId,
        name: body.data.name,
        description: body.data.description,
        permissions: normalizePlatformPermissions(body.data.permissions)
      });
      if (result === 'not_found') return reply.code(404).send({ error: 'access_profile_not_found' });
      if (result === 'protected') return reply.code(409).send({ error: 'protected_access_profile' });
      return reply.send({ status: 'updated' });
    } catch (error) {
      if (postgresErrorCode(error) === '23505') return reply.code(409).send({ error: 'access_profile_name_exists' });
      throw error;
    }
  });

  app.delete('/v1/platform/access-profiles/:profileId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requireAdmin(session, reply)) return;
    if (!session.platformAdmin) return reply.code(403).send({ error: 'platform_administrator_required' });
    const params = profileIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_access_profile_id' });
    const result = await dependencies.postgres.deletePlatformAccessProfile({
      actorUserId: session.id,
      profileId: params.data.profileId
    });
    if (result === 'not_found') return reply.code(404).send({ error: 'access_profile_not_found' });
    if (result === 'protected') return reply.code(409).send({ error: 'protected_access_profile' });
    if (result === 'in_use') return reply.code(409).send({ error: 'access_profile_in_use' });
    return reply.send({ status: 'deleted' });
  });
}
