import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthSession } from './postgres.js';

export const platformAccessModules = [
  'dashboard', 'devices', 'collectors', 'system', 'servers', 'continuity', 'firewall', 'alerts',
  'capacity', 'clients', 'plans', 'integrations', 'users', 'settings', 'audit'
] as const;

export type PlatformAccessModule = typeof platformAccessModules[number];
export type PlatformAccessLevel = 'none' | 'view' | 'manage';
export type PlatformPermissions = Record<PlatformAccessModule, PlatformAccessLevel>;

export const fullPlatformPermissions: PlatformPermissions = Object.fromEntries(
  platformAccessModules.map((module) => [module, 'manage'])
) as PlatformPermissions;

const accessRank: Record<PlatformAccessLevel, number> = { none: 0, view: 1, manage: 2 };
let administrativeReadOnlyProvider = () => false;

export function configureAdministrativeReadOnly(provider: () => boolean): void {
  administrativeReadOnlyProvider = provider;
}

function isAdministrativeMutation(request: FastifyRequest): boolean {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return false;
  const path = request.url.split('?')[0] ?? request.url;
  if (path === '/v1/redundancy/promote') return false;
  if (path === '/v1/auth/change-password') return true;
  return [
    '/v1/devices', '/v1/collectors', '/v1/users', '/v1/company', '/v1/integrations',
    '/v1/firewall', '/v1/alerts', '/v1/continuity', '/v1/platform', '/v1/system/alert-settings'
  ].some((prefix) => path.startsWith(prefix));
}

export function normalizePlatformPermissions(input: unknown): PlatformPermissions {
  const record = typeof input === 'object' && input !== null ? input as Record<string, unknown> : {};
  return Object.fromEntries(platformAccessModules.map((module) => {
    const level = record[module];
    return [module, level === 'view' || level === 'manage' ? level : 'none'];
  })) as PlatformPermissions;
}

export function hasPlatformAccess(
  session: AuthSession,
  module: PlatformAccessModule,
  required: Exclude<PlatformAccessLevel, 'none'> = 'view'
): boolean {
  if (!session.platformAdmin) return false;
  // Contas anteriores ao RBAC e o proprietário permanecem com acesso total.
  if (session.platformOwner || session.platformPermissions === undefined || session.platformPermissions === null) return true;
  return accessRank[session.platformPermissions[module] ?? 'none'] >= accessRank[required];
}

export function requirePlatformAccess(
  session: AuthSession,
  reply: FastifyReply,
  module: PlatformAccessModule,
  required: Exclude<PlatformAccessLevel, 'none'> = 'view'
): boolean {
  if (hasPlatformAccess(session, module, required)) return true;
  void reply.code(403).send({ error: 'platform_permission_required', module, level: required });
  return false;
}

function platformRouteRequirement(request: FastifyRequest): {
  module: PlatformAccessModule;
  level: Exclude<PlatformAccessLevel, 'none'>;
} | null {
  const path = request.url.split('?')[0] ?? request.url;
  const level = request.method === 'GET' || request.method === 'HEAD' ? 'view' : 'manage';
  if (/^\/v1\/system\/backups\/[^/]+\/download$/.test(path)) return { module: 'system', level: 'manage' };
  if (path === '/v1/platform/audit/export') return { module: 'audit', level: 'manage' };
  if (path.startsWith('/v1/dashboard')) return { module: 'dashboard', level };
  if (path.startsWith('/v1/devices')) return { module: 'devices', level };
  if (path.startsWith('/v1/collectors')) return { module: 'collectors', level };
  if (path.startsWith('/v1/system/alert-settings')) return { module: 'alerts', level };
  if (path.startsWith('/v1/system')) return { module: 'system', level };
  if (path.startsWith('/v1/servers')) return { module: 'servers', level };
  if (path.startsWith('/v1/redundancy')) return { module: 'continuity', level };
  if (path.startsWith('/v1/continuity')) return { module: 'continuity', level };
  if (path.startsWith('/v1/firewall')) return { module: 'firewall', level };
  if (path.startsWith('/v1/alerts')) return { module: 'alerts', level };
  if (path.startsWith('/v1/capacity')) return { module: 'capacity', level };
  if (path.startsWith('/v1/users') || path.startsWith('/v1/platform/access-profiles')) return { module: 'users', level };
  if (path.startsWith('/v1/platform/email-settings')) return { module: 'settings', level };
  if (path.startsWith('/v1/platform/backup-destination')) return { module: 'system', level };
  if (path.startsWith('/v1/platform/integrations')) return { module: 'integrations', level };
  if (path.startsWith('/v1/platform/audit')) return { module: 'audit', level };
  if (path.startsWith('/v1/platform/plans')) return { module: 'plans', level };
  if (path.startsWith('/v1/platform/tenants')) return { module: 'clients', level };
  return null;
}

export function authorizePlatformRoute(request: FastifyRequest, reply: FastifyReply, session: AuthSession): boolean {
  if (administrativeReadOnlyProvider() && isAdministrativeMutation(request)) {
    void reply.code(423).send({
      error: 'secondary_administration_read_only',
      message: 'Este servidor secundário recebe dados e permite consultas, mas alterações administrativas exigem promoção.'
    });
    return false;
  }
  if (session.context !== 'platform') return true;
  const path = request.url.split('?')[0] ?? request.url;
  if (path === '/v1/system/status' && request.method === 'GET') {
    if (hasPlatformAccess(session, 'dashboard', 'view')
      || hasPlatformAccess(session, 'system', 'view')
      || hasPlatformAccess(session, 'alerts', 'view')) return true;
    void reply.code(403).send({ error: 'platform_permission_required', module: 'system', level: 'view' });
    return false;
  }
  if (request.method === 'GET' && (path === '/v1/servers/status' || path === '/v1/capacity')
    && hasPlatformAccess(session, 'dashboard', 'view')) return true;
  if (request.method === 'GET' && /^\/v1\/platform\/tenants\/[^/]+\/company-profile\/logo$/.test(path)
    && hasPlatformAccess(session, 'dashboard', 'view')) return true;
  if (path.startsWith('/v1/system/alerts/')) {
    return requirePlatformAccess(session, reply, 'alerts', 'view');
  }
  const requirement = platformRouteRequirement(request);
  return !requirement || requirePlatformAccess(session, reply, requirement.module, requirement.level);
}
