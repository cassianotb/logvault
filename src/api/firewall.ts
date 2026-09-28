import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { isPrivateIpv4, normalizeIpv4Cidr } from '../core/ipv4-cidr.js';
import { authenticateRequest } from './auth.js';
import { requirePlatformAccess } from './access-control.js';
import type { AuthSession, PostgresRepository } from './postgres.js';

const collectorIdSchema = z.object({ collectorId: z.string().uuid() });
const authorizationIdSchema = z.object({ authorizationId: z.string().uuid() });
const policySchema = z.object({ mode: z.enum(['monitor', 'enforce']) });
const authorizationSchema = z.object({
  sourceCidr: z.string().trim().min(3).max(43),
  description: z.string().trim().max(200).default('')
});
const infrastructureServiceSchema = z.object({ service: z.enum(['web', 'ssh']) });
const infrastructurePolicySchema = z.object({ mode: z.enum(['open', 'allowlist']) });
const infrastructureAuthorizationUpdateSchema = authorizationSchema.extend({
  service: z.enum(['web', 'ssh'])
});

function requireViewer(session: AuthSession, reply: FastifyReply): boolean {
  if (session.role === 'admin' || session.role === 'auditor') return true;
  void reply.code(403).send({ error: 'firewall_access_required' });
  return false;
}

function requireAdmin(session: AuthSession, reply: FastifyReply): boolean {
  if (session.role === 'admin') return true;
  void reply.code(403).send({ error: 'administrator_required' });
  return false;
}

function scopeTenantId(session: AuthSession): string | null {
  return session.context === 'platform' ? null : session.tenantId;
}

export function registerFirewallRoutes(
  app: FastifyInstance,
  dependencies: { postgres: PostgresRepository }
): void {
  app.get('/v1/firewall', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requireViewer(session, reply)) return;
    const collectors = await dependencies.postgres.listFirewallCollectors(scopeTenantId(session));
    const infrastructureAccess = session.context === 'platform'
      ? await dependencies.postgres.listInfrastructureFirewallPolicies()
      : null;
    const enriched = collectors.map((collector) => ({
      ...collector,
      policySynchronized: collector.collectorMode !== 'cloud'
        ? null
        : Boolean(
            collector.policyMode
            && collector.policyMode === collector.appliedMode
            && collector.policyUpdatedAt
            && collector.appliedPolicyUpdatedAt
            && Date.parse(collector.appliedPolicyUpdatedAt) >= Date.parse(collector.policyUpdatedAt)
          ),
      observations: collector.observations.map((observation) => ({
        ...observation,
        privateSource: isPrivateIpv4(observation.sourceIp)
      }))
    }));
    const cloud = enriched.filter((collector) => collector.collectorMode === 'cloud');
    return reply.send({
      scope: session.context,
      generatedAt: new Date().toISOString(),
      infrastructureAccess: infrastructureAccess?.map((policy) => ({
        ...policy,
        policySynchronized: Boolean(
          policy.mode === policy.appliedMode
          && policy.appliedPolicyUpdatedAt
          && Date.parse(policy.appliedPolicyUpdatedAt) >= Date.parse(policy.updatedAt)
        ),
        applicationState: 'pending_host_agent'
      })) ?? null,
      summary: {
        collectors: enriched.length,
        cloudCollectors: cloud.length,
        monitoring: cloud.filter((collector) => collector.policyMode === 'monitor').length,
        enforcing: cloud.filter((collector) => collector.policyMode === 'enforce').length,
        pendingApply: cloud.filter((collector) => !collector.policySynchronized).length,
        authorizedSources: cloud.reduce((total, collector) => total + collector.authorizations.length, 0),
        observedSources: cloud.reduce((total, collector) => total + collector.observations.length, 0),
        blockedPackets: cloud.reduce((total, collector) => total
          + collector.observations.reduce((subtotal, observation) => subtotal + observation.blockedPacketCount, 0), 0)
      },
      collectors: enriched
    });
  });

  app.put('/v1/firewall/infrastructure/:service/policy', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (session.context !== 'platform') return reply.code(403).send({ error: 'platform_context_required' });
    if (!requirePlatformAccess(session, reply, 'firewall', 'manage')) return;
    const params = infrastructureServiceSchema.safeParse(request.params);
    const body = infrastructurePolicySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: 'invalid_infrastructure_firewall_policy' });
    }
    const result = await dependencies.postgres.updateInfrastructureFirewallPolicy({
      service: params.data.service,
      mode: body.data.mode,
      actorUserId: session.id
    });
    if (result.status === 'authorization_required') {
      return reply.code(409).send({ error: 'infrastructure_firewall_authorization_required' });
    }
    return reply.send({ policy: result.policy, applicationState: 'pending_host_agent' });
  });

  app.post('/v1/firewall/infrastructure/:service/authorizations', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (session.context !== 'platform') return reply.code(403).send({ error: 'platform_context_required' });
    if (!requirePlatformAccess(session, reply, 'firewall', 'manage')) return;
    const params = infrastructureServiceSchema.safeParse(request.params);
    const body = authorizationSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: 'invalid_infrastructure_firewall_authorization' });
    }
    const sourceCidr = normalizeIpv4Cidr(body.data.sourceCidr);
    if (!sourceCidr) return reply.code(400).send({ error: 'invalid_ipv4_cidr' });
    const result = await dependencies.postgres.createInfrastructureFirewallAuthorization({
      service: params.data.service,
      sourceCidr,
      description: body.data.description,
      actorUserId: session.id
    });
    if (result.status === 'duplicate') {
      return reply.code(409).send({ error: 'infrastructure_firewall_authorization_exists' });
    }
    return reply.code(201).send({
      authorization: result.authorization,
      applicationState: 'pending_host_agent'
    });
  });

  app.delete('/v1/firewall/infrastructure/authorizations/:authorizationId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (session.context !== 'platform') return reply.code(403).send({ error: 'platform_context_required' });
    if (!requirePlatformAccess(session, reply, 'firewall', 'manage')) return;
    const params = authorizationIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_firewall_authorization_id' });
    const result = await dependencies.postgres.deleteInfrastructureFirewallAuthorization({
      authorizationId: params.data.authorizationId,
      actorUserId: session.id
    });
    if (result.status === 'authorization_not_found') {
      return reply.code(404).send({ error: 'firewall_authorization_not_found' });
    }
    if (result.status === 'last_authorization_required') {
      return reply.code(409).send({ error: 'last_infrastructure_firewall_authorization_required' });
    }
    return reply.send({ status: 'deleted', applicationState: 'pending_host_agent' });
  });

  app.put('/v1/firewall/infrastructure/authorizations/:authorizationId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (session.context !== 'platform') return reply.code(403).send({ error: 'platform_context_required' });
    if (!requirePlatformAccess(session, reply, 'firewall', 'manage')) return;
    const params = authorizationIdSchema.safeParse(request.params);
    const body = infrastructureAuthorizationUpdateSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: 'invalid_infrastructure_firewall_authorization' });
    }
    const sourceCidr = normalizeIpv4Cidr(body.data.sourceCidr);
    if (!sourceCidr) return reply.code(400).send({ error: 'invalid_ipv4_cidr' });
    const result = await dependencies.postgres.updateInfrastructureFirewallAuthorization({
      authorizationId: params.data.authorizationId,
      service: body.data.service,
      sourceCidr,
      description: body.data.description,
      actorUserId: session.id
    });
    if (result.status === 'authorization_not_found') {
      return reply.code(404).send({ error: 'firewall_authorization_not_found' });
    }
    if (result.status === 'duplicate') {
      return reply.code(409).send({ error: 'infrastructure_firewall_authorization_exists' });
    }
    if (result.status === 'last_authorization_required') {
      return reply.code(409).send({ error: 'last_infrastructure_firewall_authorization_required' });
    }
    return reply.send({ authorization: result.authorization, applicationState: 'pending_host_agent' });
  });

  app.put('/v1/firewall/collectors/:collectorId/policy', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requireAdmin(session, reply)) return;
    const params = collectorIdSchema.safeParse(request.params);
    const body = policySchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_firewall_policy' });
    const result = await dependencies.postgres.updateFirewallPolicy({
      collectorId: params.data.collectorId,
      tenantId: scopeTenantId(session),
      actorUserId: session.id,
      mode: body.data.mode
    });
    if (result.status === 'collector_not_found') return reply.code(404).send({ error: 'collector_not_found' });
    if (result.status === 'edge_collector') return reply.code(409).send({ error: 'edge_firewall_managed_locally' });
    if (result.status === 'authorization_required') {
      return reply.code(409).send({ error: 'firewall_authorization_required' });
    }
    return reply.send({ policy: result, applyWithinSeconds: 15 });
  });

  app.post('/v1/firewall/collectors/:collectorId/authorizations', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requireAdmin(session, reply)) return;
    const params = collectorIdSchema.safeParse(request.params);
    const body = authorizationSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_firewall_authorization' });
    const sourceCidr = normalizeIpv4Cidr(body.data.sourceCidr);
    if (!sourceCidr) return reply.code(400).send({ error: 'invalid_ipv4_cidr' });
    const result = await dependencies.postgres.createFirewallAuthorization({
      collectorId: params.data.collectorId,
      tenantId: scopeTenantId(session),
      actorUserId: session.id,
      sourceCidr,
      description: body.data.description
    });
    if (result.status === 'collector_not_found') return reply.code(404).send({ error: 'collector_not_found' });
    if (result.status === 'edge_collector') return reply.code(409).send({ error: 'edge_firewall_managed_locally' });
    if (result.status === 'duplicate') return reply.code(409).send({ error: 'firewall_authorization_exists' });
    return reply.code(201).send({ authorization: result.authorization, applyWithinSeconds: 15 });
  });

  app.delete('/v1/firewall/authorizations/:authorizationId', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requireAdmin(session, reply)) return;
    const params = authorizationIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_firewall_authorization_id' });
    const result = await dependencies.postgres.deleteFirewallAuthorization({
      authorizationId: params.data.authorizationId,
      tenantId: scopeTenantId(session),
      actorUserId: session.id
    });
    if (result.status === 'authorization_not_found') {
      return reply.code(404).send({ error: 'firewall_authorization_not_found' });
    }
    if (result.status === 'last_authorization_required') {
      return reply.code(409).send({ error: 'last_firewall_authorization_required' });
    }
    return reply.send({ status: 'deleted', applyWithinSeconds: 15 });
  });
}
