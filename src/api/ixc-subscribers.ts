import { localDateTimeToUtc } from '../core/timezone.js';
import { openSecret } from '../core/secret-box.js';
import { listIxcResource, type IxcFetch, type IxcResource } from './ixc-client.js';
import type { ErpIntegrationRecord } from './postgres.js';
import type { SubscriberLookup, SubscriberResolution } from './subscribers.js';

const provider = 'ixc' as const;
const maximumRecordsPerLookup = 2_000;

type IxcRecord = Record<string, unknown>;

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function first(...values: unknown[]): string {
  return values.map(text).find(Boolean) ?? '';
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/:\/\/[^/@\s]+:[^/@\s]+@/g, '://***@').replace(/\s+/g, ' ').slice(0, 300);
}

function ixcDateTimeToUtc(value: unknown, timezone: string): string | null {
  const raw = text(value);
  if (!raw || /^0{4}-0{2}-0{2}/.test(raw)) return null;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) throw new Error('Data inválida recebida da API IXC');
    return parsed.toISOString();
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  const brazilian = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (iso) return localDateTimeToUtc(`${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:${iso[6]}`, timezone);
  if (brazilian) {
    return localDateTimeToUtc(`${brazilian[3]}-${brazilian[2]}-${brazilian[1]}T${brazilian[4]}:${brazilian[5]}:${brazilian[6]}`, timezone);
  }
  throw new Error('Data inválida recebida da API IXC');
}

function contractStatus(value: unknown): string {
  const raw = text(value);
  const labels: Record<string, string> = {
    A: 'Ativo', I: 'Inativo', P: 'Pré-contrato', D: 'Desistiu', C: 'Cancelado', N: 'Negativado'
  };
  return labels[raw.toUpperCase()] ?? raw;
}

async function listAll(input: {
  baseUrl: string;
  token: string;
  resource: IxcResource;
  qtype: string;
  query: string;
  sortname?: string;
  sortorder?: 'asc' | 'desc';
  fetcher?: IxcFetch;
}): Promise<IxcRecord[]> {
  const firstPage = await listIxcResource<IxcRecord>({
    ...input,
    page: 1,
    recordsPerPage: 100
  });
  if (firstPage.total > maximumRecordsPerLookup) {
    throw new Error('A consulta IXC retornou registros demais para uma correlação segura');
  }
  const records = [...firstPage.records];
  const pages = Math.ceil(firstPage.total / 100);
  for (let page = 2; page <= pages; page += 1) {
    const result = await listIxcResource<IxcRecord>({ ...input, page, recordsPerPage: 100 });
    records.push(...result.records);
  }
  return records;
}

export async function resolveIxcSubscribers(
  record: ErpIntegrationRecord,
  encryptionKey: string,
  privateIps: string[],
  at: string,
  timezone: string,
  fetcher?: IxcFetch
): Promise<SubscriberResolution> {
  const subscribers = new Map<string, SubscriberLookup>();
  try {
    const settings = record.settings as { lastTest?: { status?: unknown } | null };
    const secrets = JSON.parse(openSecret(record.secretRef, encryptionKey)) as { token?: unknown };
    const token = text(secrets.token);
    if (settings.lastTest?.status !== 'success' || !record.baseUrl || !token) {
      return { status: 'not_configured', provider, subscribers };
    }
    const target = Date.parse(at);
    if (!Number.isFinite(target)) throw new Error('Data da correlação inválida');

    const sessionByIp = new Map<string, { row: IxcRecord; startedAt: string; updatedAt: string | null; stoppedAt: string | null }>();
    for (const privateIp of privateIps) {
      const rows = await listAll({
        baseUrl: record.baseUrl,
        token,
        resource: 'radacct',
        qtype: 'radacct.framedipaddress',
        query: privateIp,
        sortname: 'radacct.acctstarttime',
        sortorder: 'desc',
        ...(fetcher ? { fetcher } : {})
      });
      const overlapping = rows.filter((row) => text(row.framedipaddress) === privateIp).flatMap((row) => {
        const startedAt = ixcDateTimeToUtc(row.acctstarttime, timezone);
        const stoppedAt = ixcDateTimeToUtc(row.acctstoptime, timezone);
        const updatedAt = ixcDateTimeToUtc(row.acctupdatetime, timezone);
        if (!startedAt) return [];
        const started = Date.parse(startedAt);
        const stopped = stoppedAt ? Date.parse(stoppedAt) : null;
        return started <= target && (stopped === null || stopped >= target)
          ? [{ row, startedAt, updatedAt, stoppedAt }]
          : [];
      });
      if (!overlapping.length) subscribers.set(privateIp, { status: 'not_found', provider });
      else if (overlapping.length > 1) subscribers.set(privateIp, { status: 'ambiguous', provider });
      else sessionByIp.set(privateIp, overlapping[0]!);
    }

    const radiusUserCache = new Map<string, IxcRecord | null | 'ambiguous'>();
    const clientCache = new Map<string, IxcRecord | null>();
    const contractCache = new Map<string, IxcRecord | null>();
    for (const [privateIp, session] of sessionByIp) {
      const username = first(session.row.username);
      const normalizedUsername = username.toLocaleLowerCase('en-US');
      if (!username) {
        subscribers.set(privateIp, { status: 'not_found', provider });
        continue;
      }
      if (!radiusUserCache.has(normalizedUsername)) {
        const users = await listAll({
          baseUrl: record.baseUrl,
          token,
          resource: 'radusuarios',
          qtype: 'radusuarios.login',
          query: username,
          sortname: 'radusuarios.id',
          ...(fetcher ? { fetcher } : {})
        });
        const exact = users.filter((item) => text(item.login).toLocaleLowerCase('en-US') === normalizedUsername);
        const links = new Map(exact.map((item) => [`${text(item.id_cliente)}:${text(item.id_contrato)}`, item]));
        radiusUserCache.set(normalizedUsername, links.size === 1 ? [...links.values()][0]! : links.size > 1 ? 'ambiguous' : null);
      }
      const radiusUser = radiusUserCache.get(normalizedUsername);
      if (radiusUser === 'ambiguous') {
        subscribers.set(privateIp, { status: 'ambiguous', provider });
        continue;
      }
      if (!radiusUser) {
        subscribers.set(privateIp, { status: 'not_found', provider });
        continue;
      }
      const clientId = text(radiusUser.id_cliente);
      const contractId = text(radiusUser.id_contrato);
      if (!clientId || !contractId) {
        subscribers.set(privateIp, { status: 'not_found', provider });
        continue;
      }
      if (!clientCache.has(clientId)) {
        const clients = await listAll({
          baseUrl: record.baseUrl, token, resource: 'cliente', qtype: 'cliente.id', query: clientId,
          sortname: 'cliente.id', ...(fetcher ? { fetcher } : {})
        });
        clientCache.set(clientId, clients.find((item) => text(item.id) === clientId) ?? null);
      }
      if (!contractCache.has(contractId)) {
        const contracts = await listAll({
          baseUrl: record.baseUrl, token, resource: 'cliente_contrato', qtype: 'cliente_contrato.id', query: contractId,
          sortname: 'cliente_contrato.id', ...(fetcher ? { fetcher } : {})
        });
        contractCache.set(contractId, contracts.find((item) => text(item.id) === contractId) ?? null);
      }
      const client = clientCache.get(clientId);
      const contract = contractCache.get(contractId);
      if (!client || !contract) {
        subscribers.set(privateIp, { status: 'not_found', provider });
        continue;
      }
      subscribers.set(privateIp, {
        status: 'identified',
        provider,
        name: first(client.razao, client.fantasia),
        taxId: first(client.cnpj_cpf),
        identity: first(client.ie_identidade),
        phone: first(client.telefone_celular, client.fone, client.telefone_comercial),
        email: first(client.email),
        address: {
          postalCode: first(radiusUser.cep, client.cep),
          street: first(radiusUser.endereco, client.endereco),
          number: first(radiusUser.numero, client.numero),
          complement: first(radiusUser.complemento, client.complemento),
          district: first(radiusUser.bairro, client.bairro),
          city: first(radiusUser.cidade, client.cidade),
          state: first(radiusUser.uf, client.uf)
        },
        username,
        contractId,
        contractNumber: first(contract.contrato, contract.id),
        contractStatus: contractStatus(contract.status),
        radiusSession: {
          startedAt: session.startedAt,
          updatedAt: session.updatedAt,
          stoppedAt: session.stoppedAt
        }
      });
    }
    return { status: 'success', provider, subscribers };
  } catch (error) {
    return { status: 'unavailable', provider, message: safeMessage(error), subscribers };
  }
}
