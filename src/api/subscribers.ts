import { Client, type ClientConfig } from 'pg';
import { z } from 'zod';
import { openSecret } from '../core/secret-box.js';
import { resolveIxcSubscribers } from './ixc-subscribers.js';
import type { ErpIntegrationRecord, PostgresRepository } from './postgres.js';

const provider = 'elleven';
function normalizeColumns(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  const content = value.trim().replace(/^\{/, '').replace(/\}$/, '');
  return content.split(',').map((column) => column.trim().replace(/^"|"$/g, '')).filter(Boolean);
}
const databaseSettingsSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  database: z.string().min(1),
  schema: z.string().min(1),
  username: z.string().min(1),
  sslMode: z.enum(['disable', 'require', 'verify-full']),
  lastTest: z.object({ status: z.enum(['success', 'failed']) }).passthrough().nullable().default(null),
  candidates: z.array(z.object({
    schema: z.string(), table: z.string(), columns: z.preprocess(normalizeColumns, z.array(z.string()))
  })).default([])
});
const settingsSchema = z.object({
  radius: databaseSettingsSchema,
  voalleDatabase: databaseSettingsSchema
});
const secretsSchema = z.object({
  radiusPassword: z.string().min(1),
  voalleDatabasePassword: z.string().min(1)
});

export type SubscriberProvider = 'elleven' | 'ixc';

export type SubscriberIdentity = {
  status: 'identified';
  provider: SubscriberProvider;
  name: string;
  taxId: string;
  identity: string;
  phone: string;
  email: string;
  address: {
    postalCode: string;
    street: string;
    number: string;
    complement: string;
    district: string;
    city: string;
    state: string;
  };
  username: string;
  contractId: string;
  contractNumber: string;
  contractStatus?: string;
  radiusSession: { startedAt: string; updatedAt: string | null; stoppedAt: string | null };
};

export type SubscriberLookup = SubscriberIdentity | {
  status: 'not_found' | 'ambiguous';
  provider: SubscriberProvider;
};

export type SubscriberSnapshot = SubscriberLookup | {
  status: 'erp_not_integrated' | 'integration_unavailable';
  provider?: SubscriberProvider;
};

export interface SubscriberResolution {
  status: 'success' | 'not_configured' | 'unavailable';
  provider: SubscriberProvider;
  message?: string;
  subscribers: Map<string, SubscriberLookup>;
}

export type SubscriberResolver = (input: {
  tenantId: string;
  privateIps: string[];
  at: string;
  timezone: string;
}) => Promise<SubscriberResolution>;

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function clientConfig(settings: z.infer<typeof databaseSettingsSchema>, password: string): ClientConfig {
  return {
    host: settings.host,
    port: settings.port,
    database: settings.database,
    user: settings.username,
    password,
    ssl: settings.sslMode === 'disable' ? false : { rejectUnauthorized: settings.sslMode === 'verify-full' },
    application_name: 'argus-subscriber-correlation',
    connectionTimeoutMillis: 8_000,
    query_timeout: 12_000,
    statement_timeout: 12_000
  };
}

function radiusCandidate(settings: z.infer<typeof databaseSettingsSchema>) {
  const required = ['username', 'framedipaddress', 'acctstarttime', 'acctupdatetime', 'acctstoptime'];
  return settings.candidates.find((candidate) => required.every((column) => candidate.columns.includes(column))) ?? null;
}

function voalleCandidate(settings: z.infer<typeof databaseSettingsSchema>) {
  const required = ['user', 'contract_id', 'active'];
  return settings.candidates.find((candidate) => candidate.table === 'authentication_contracts'
    && required.every((column) => candidate.columns.includes(column))) ?? null;
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/:\/\/[^/@\s]+:[^/@\s]+@/g, '://***@').replace(/\s+/g, ' ').slice(0, 300);
}

export function createSubscriberResolver(dependencies: {
  postgres: PostgresRepository;
  encryptionKey: string;
}): SubscriberResolver {
  return async ({ tenantId, privateIps, at, timezone }) => {
    const uniqueIps = [...new Set(privateIps)];
    const empty = new Map<string, SubscriberLookup>();
    if (!uniqueIps.length) return { status: 'success', provider, subscribers: empty };
    if (await dependencies.postgres.isIntegrationProviderEnabled(provider)) {
      const record = await dependencies.postgres.getErpIntegration(tenantId, provider);
      if (record?.enabled) return resolveEllevenSubscribers(record, dependencies.encryptionKey, uniqueIps, at);
    }
    const ixcProvider = 'ixc' as const;
    if (await dependencies.postgres.isIntegrationProviderEnabled(ixcProvider)) {
      const record = await dependencies.postgres.getErpIntegration(tenantId, ixcProvider);
      if (record?.enabled) {
        return resolveIxcSubscribers(record, dependencies.encryptionKey, uniqueIps, at, timezone);
      }
      if (record) return { status: 'not_configured', provider: ixcProvider, subscribers: empty };
    }
    return { status: 'not_configured', provider, subscribers: empty };
  };
}

export async function resolveEllevenSubscribers(
  record: ErpIntegrationRecord,
  encryptionKey: string,
  privateIps: string[],
  at: string
): Promise<SubscriberResolution> {
  const subscribers = new Map<string, SubscriberLookup>();
  let radius: Client | null = null;
  let voalle: Client | null = null;
  try {
    const settings = settingsSchema.parse(record.settings);
    const secrets = secretsSchema.parse(JSON.parse(openSecret(record.secretRef, encryptionKey)));
    if (settings.radius.lastTest?.status !== 'success' || settings.voalleDatabase.lastTest?.status !== 'success') {
      return { status: 'not_configured', provider, subscribers };
    }
    const candidate = radiusCandidate(settings.radius);
    if (!candidate) return { status: 'not_configured', provider, message: 'Mapeamento RADIUS não encontrado', subscribers };
    const customerCandidate = voalleCandidate(settings.voalleDatabase);
    if (!customerCandidate) return { status: 'not_configured', provider, message: 'Mapeamento Voalle não encontrado', subscribers };
    radius = new Client(clientConfig(settings.radius, secrets.radiusPassword));
    voalle = new Client(clientConfig(settings.voalleDatabase, secrets.voalleDatabasePassword));
    await Promise.all([radius.connect(), voalle.connect()]);

    const radiusTable = `${quoteIdentifier(candidate.schema)}.${quoteIdentifier(candidate.table)}`;
    const radiusResult = await radius.query<{
      private_ip: string; username: string; started_at: string; updated_at: string | null;
      stopped_at: string | null; overlapping_sessions: string;
    }>(`
      WITH matches AS (
        SELECT
          host(r.framedipaddress) AS private_ip,
          btrim(r.username) AS username,
          r.acctstarttime AS started_at,
          r.acctupdatetime AS updated_at,
          r.acctstoptime AS stopped_at,
          count(*) OVER (PARTITION BY r.framedipaddress) AS overlapping_sessions,
          row_number() OVER (
            PARTITION BY r.framedipaddress
            ORDER BY r.acctstarttime DESC, r.acctupdatetime DESC NULLS LAST
          ) AS position
        FROM ${radiusTable} r
        WHERE r.framedipaddress = ANY($1::inet[])
          AND r.acctstarttime <= $2::timestamptz
          AND (r.acctstoptime IS NULL OR r.acctstoptime >= $2::timestamptz)
          AND r.username IS NOT NULL AND btrim(r.username) <> ''
      )
      SELECT private_ip, username, started_at, updated_at, stopped_at, overlapping_sessions
      FROM matches WHERE position = 1
    `, [privateIps, at]);
    const radiusByIp = new Map(radiusResult.rows.map((row) => [row.private_ip, row]));
    const usernames = [...new Set(radiusResult.rows.map((row) => row.username.toLocaleLowerCase('en-US')))].filter(Boolean);

    const voalleSchema = quoteIdentifier(customerCandidate.schema);
    const voalleResult = usernames.length ? await voalle.query<{
      normalized_username: string; username: string; contract_id: string; contract_number: string | null;
      name: string; tax_id: string | null; identity: string | null; phone: string | null; cell_phone: string | null;
      email: string | null; postal_code: string | null; street: string | null; number: string | null;
      complement: string | null; district: string | null; city: string | null; state: string | null;
    }>(`
      SELECT DISTINCT ON (lower(btrim(ac."user")))
        lower(btrim(ac."user")) AS normalized_username,
        btrim(ac."user") AS username,
        c.id::text AS contract_id,
        c.contract_number,
        p.name,
        p.tx_id AS tax_id,
        p.identity,
        p.phone,
        COALESCE(p.cell_phone_1, p.cell_phone_2) AS cell_phone,
        p.email,
        p.postal_code,
        p.street,
        p.number,
        p.address_complement AS complement,
        p.neighborhood AS district,
        p.city,
        p.state
      FROM ${voalleSchema}.authentication_contracts ac
      JOIN ${voalleSchema}.contracts c
        ON c.id = ac.contract_id AND COALESCE(c.deleted, false) = false
      JOIN ${voalleSchema}.people p
        ON p.id = c.client_id AND COALESCE(p.deleted, false) = false
      WHERE lower(btrim(ac."user")) = ANY($1::text[])
      ORDER BY lower(btrim(ac."user")), ac.active DESC, ac.id DESC
    `, [usernames]) : { rows: [] };
    const subscriberByUsername = new Map(voalleResult.rows.map((row) => [row.normalized_username, row]));

    for (const privateIp of privateIps) {
      const session = radiusByIp.get(privateIp);
      if (!session) {
        subscribers.set(privateIp, { status: 'not_found', provider });
        continue;
      }
      if (Number(session.overlapping_sessions) > 1) {
        subscribers.set(privateIp, { status: 'ambiguous', provider });
        continue;
      }
      const subscriber = subscriberByUsername.get(session.username.toLocaleLowerCase('en-US'));
      if (!subscriber) {
        subscribers.set(privateIp, { status: 'not_found', provider });
        continue;
      }
      subscribers.set(privateIp, {
        status: 'identified',
        provider,
        name: subscriber.name,
        taxId: subscriber.tax_id ?? '',
        identity: subscriber.identity ?? '',
        phone: subscriber.cell_phone || subscriber.phone || '',
        email: subscriber.email ?? '',
        address: {
          postalCode: subscriber.postal_code ?? '',
          street: subscriber.street ?? '',
          number: subscriber.number ?? '',
          complement: subscriber.complement ?? '',
          district: subscriber.district ?? '',
          city: subscriber.city ?? '',
          state: subscriber.state ?? ''
        },
        username: subscriber.username,
        contractId: subscriber.contract_id,
        contractNumber: subscriber.contract_number ?? '',
        radiusSession: {
          startedAt: new Date(session.started_at).toISOString(),
          updatedAt: session.updated_at ? new Date(session.updated_at).toISOString() : null,
          stoppedAt: session.stopped_at ? new Date(session.stopped_at).toISOString() : null
        }
      });
    }
    return { status: 'success', provider, subscribers };
  } catch (error) {
    return { status: 'unavailable', provider, message: safeMessage(error), subscribers };
  } finally {
    await Promise.all([radius?.end().catch(() => undefined), voalle?.end().catch(() => undefined)]);
  }
}
