import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { batchChecksum, sha256 } from '../core/crypto.js';
import {
  collectorHeartbeatSchema,
  appliedFirewallPolicySchema,
  firewallObservationSchema,
  ingestBatchSchema,
  managedCloudCollectorConfigurationSchema,
  managedCloudCollectorTelemetrySchema
} from '../domain/models.js';
import type { ClickHouseRepository } from './clickhouse.js';
import type { PostgresRepository } from './postgres.js';

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice(7).trim();
  return token && token.length <= 4096 ? token : undefined;
}

const managedCloudHeartbeatSchema = collectorHeartbeatSchema
  .pick({ version: true, sentAt: true, hostMetrics: true })
  .extend({
    collectorTelemetry: z.array(managedCloudCollectorTelemetrySchema).max(1000).default([]),
    firewallObservations: z.array(firewallObservationSchema).max(10000).default([]),
    appliedFirewallPolicies: z.array(appliedFirewallPolicySchema).max(1000).default([])
  });

export function registerIngestionRoutes(
  app: FastifyInstance,
  dependencies: {
    postgres: PostgresRepository;
    clickhouse: ClickHouseRepository;
    managedCloudTokenHash: string;
    useSecondaryCloudPorts?: () => boolean;
  }
): void {
  app.post('/v1/ingest/managed-cloud/registry', async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (!token || sha256(token) !== dependencies.managedCloudTokenHash) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const parsed = managedCloudHeartbeatSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_managed_cloud_heartbeat' });
    await dependencies.postgres.touchManagedCloudCollectors({
      version: parsed.data.version,
      sampledAt: parsed.data.sentAt,
      collectorTelemetry: parsed.data.collectorTelemetry,
      firewallObservations: parsed.data.firewallObservations,
      appliedFirewallPolicies: parsed.data.appliedFirewallPolicies,
      ...(parsed.data.hostMetrics ? { hostMetrics: parsed.data.hostMetrics } : {})
    });
    const collectors = await dependencies.postgres.listManagedCloudCollectorConfiguration(
      dependencies.useSecondaryCloudPorts?.() ?? false
    );
    const validated = managedCloudCollectorConfigurationSchema.array().max(1000).parse(collectors);
    return reply.send({ status: 'recorded', receivedAt: new Date().toISOString(), collectors: validated });
  });

  app.post('/v1/ingest/heartbeat', async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    const identity = token
      ? await dependencies.postgres.findCollectorIdentityByTokenHash(sha256(token))
      : undefined;
    if (!identity) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = collectorHeartbeatSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_heartbeat', details: parsed.error.flatten() });
    if (parsed.data.tenantId !== identity.tenantId || parsed.data.collectorId !== identity.id) {
      return reply.code(403).send({ error: 'collector_identity_mismatch' });
    }
    const recorded = await dependencies.postgres.recordCollectorHeartbeat(parsed.data);
    if (!recorded) return reply.code(404).send({ error: 'collector_not_found' });
    const receivedAt = new Date().toISOString();
    if (parsed.data.hostMetrics) {
      try {
        await dependencies.clickhouse.insertServerMetric({
          tenantId: parsed.data.tenantId,
          serverId: `collector:${parsed.data.collectorId}`,
          sampledAt: receivedAt,
          metrics: parsed.data.hostMetrics
        });
      } catch (error) {
        request.log.warn({ error, collectorId: parsed.data.collectorId }, 'Falha ao registrar histórico de recursos');
      }
    }
    const devices = await dependencies.postgres.listCollectorDeviceConfiguration(
      parsed.data.tenantId,
      parsed.data.collectorId
    );
    return reply.send({ status: 'recorded', receivedAt, devices });
  });

  app.post('/v1/ingest/batches', { bodyLimit: 64 * 1024 * 1024 }, async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    const tokenHash = token ? sha256(token) : undefined;
    const managedCloudToken = tokenHash === dependencies.managedCloudTokenHash;
    const identity = token
      ? await dependencies.postgres.findCollectorIdentityByTokenHash(tokenHash ?? '')
      : undefined;
    if (!identity && !managedCloudToken) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = ingestBatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_batch', details: parsed.error.flatten() });
    const batch = parsed.data;
    if (!identity || batch.tenantId !== identity.tenantId || batch.collectorId !== identity.id) {
      const managedCloudAllowed = managedCloudToken
        && await dependencies.postgres.isActiveManagedCloudCollector(batch.tenantId, batch.collectorId);
      if (!managedCloudAllowed) return reply.code(403).send({ error: 'collector_identity_mismatch' });
    }
    const rawById = new Map<string, (typeof batch.rawRecords)[number]>();
    for (const raw of batch.rawRecords) {
      if (
        raw.batchId !== batch.batchId
        || raw.tenantId !== batch.tenantId
        || raw.collectorId !== batch.collectorId
        || rawById.has(raw.rawId)
      ) {
        return reply.code(400).send({ error: 'batch_identity_mismatch', rawId: raw.rawId });
      }
      rawById.set(raw.rawId, raw);
      const payload = Buffer.from(raw.rawPayload, 'base64');
      if (sha256(payload) !== raw.rawSha256) return reply.code(400).send({ error: 'raw_checksum_mismatch', rawId: raw.rawId });
    }
    const eventIds = new Set<string>();
    for (const event of batch.events) {
      const raw = rawById.get(event.rawId);
      if (
        event.batchId !== batch.batchId
        || event.tenantId !== batch.tenantId
        || event.collectorId !== batch.collectorId
        || !raw
        || event.deviceId !== raw.deviceId
        || event.vendor !== raw.vendor
        || event.sourceType !== raw.sourceType
        || event.receivedAt !== raw.receivedAt
        || eventIds.has(event.eventId)
      ) {
        return reply.code(400).send({ error: 'event_identity_mismatch', eventId: event.eventId });
      }
      eventIds.add(event.eventId);
    }
    const expectedChecksum = batchChecksum(batch.rawRecords, batch.events);
    if (expectedChecksum !== batch.checksum) return reply.code(400).send({ error: 'batch_checksum_mismatch' });

    const registration = await dependencies.postgres.registerBatch(batch);
    if (registration.status === 'committed') {
      return reply.send({ batchId: batch.batchId, status: 'committed', duplicate: true });
    }

    try {
      const counts = await dependencies.clickhouse.countBatch(batch.batchId);
      if (counts.rawCount !== batch.rawRecords.length || counts.eventCount !== batch.events.length) {
        await dependencies.clickhouse.insertBatch(batch);
      }
      const confirmed = await dependencies.clickhouse.countBatch(batch.batchId);
      if (confirmed.rawCount !== batch.rawRecords.length || confirmed.eventCount !== batch.events.length) {
        throw new Error(`Contagem persistida divergente: raw=${confirmed.rawCount}/${batch.rawRecords.length}, eventos=${confirmed.eventCount}/${batch.events.length}`);
      }
      await dependencies.postgres.markBatchCommitted(batch.batchId);
      return reply.send({ batchId: batch.batchId, status: 'committed', duplicate: registration.status !== 'new' });
    } catch (error) {
      request.log.error({ error, batchId: batch.batchId }, 'Falha ao persistir lote');
      return reply.code(503).send({ error: 'batch_not_committed', batchId: batch.batchId });
    }
  });
}
