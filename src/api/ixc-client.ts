export const IXC_RESOURCES = ['radacct', 'radusuarios', 'cliente', 'cliente_contrato'] as const;

export type IxcResource = typeof IXC_RESOURCES[number];

export interface IxcListResult<T extends Record<string, unknown>> {
  total: number;
  records: T[];
}

export type IxcFetch = typeof fetch;

function safeApiMessage(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
}

export function normalizeIxcBaseUrl(value: string): string {
  const url = new URL(value.trim());
  url.username = '';
  url.password = '';
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

export async function listIxcResource<T extends Record<string, unknown>>(input: {
  baseUrl: string;
  token: string;
  resource: IxcResource;
  qtype: string;
  query: string;
  oper?: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'L';
  page?: number;
  recordsPerPage?: number;
  sortname?: string;
  sortorder?: 'asc' | 'desc';
  fetcher?: IxcFetch;
  timeoutMs?: number;
}): Promise<IxcListResult<T>> {
  const fetcher = input.fetcher ?? fetch;
  const endpoint = `${normalizeIxcBaseUrl(input.baseUrl)}/${input.resource}`;
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(input.token, 'utf8').toString('base64')}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ixcsoft: 'listar'
    },
    body: JSON.stringify({
      qtype: input.qtype,
      query: input.query,
      oper: input.oper ?? '=',
      page: String(input.page ?? 1),
      rp: String(input.recordsPerPage ?? 20),
      sortname: input.sortname ?? input.qtype,
      sortorder: input.sortorder ?? 'asc'
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(input.timeoutMs ?? 12_000)
  });
  const raw = await response.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`IXC respondeu em formato inválido (HTTP ${response.status})`);
  }
  if (!response.ok) throw new Error(`IXC respondeu com HTTP ${response.status}`);
  if (body.type === 'error') {
    throw new Error(safeApiMessage(body.message) || 'A API IXC recusou a consulta');
  }
  const records = Array.isArray(body.registros)
    ? body.registros.filter((record): record is T => Boolean(record) && typeof record === 'object')
    : [];
  const parsedTotal = Number(body.total ?? records.length);
  return { total: Number.isFinite(parsedTotal) ? parsedTotal : records.length, records };
}

export interface IxcConnectionTestResult {
  resources: Array<{ resource: IxcResource; status: 'success' }>;
}

export async function testIxcApi(input: {
  baseUrl: string;
  token: string;
  fetcher?: IxcFetch;
}): Promise<IxcConnectionTestResult> {
  const queries: Record<IxcResource, string> = {
    radacct: 'radacct.radacctid',
    radusuarios: 'radusuarios.id',
    cliente: 'cliente.id',
    cliente_contrato: 'cliente_contrato.id'
  };
  const resources: IxcConnectionTestResult['resources'] = [];
  for (const resource of IXC_RESOURCES) {
    await listIxcResource({
      ...input,
      resource,
      qtype: queries[resource],
      query: '-1',
      recordsPerPage: 1
    });
    resources.push({ resource, status: 'success' });
  }
  return { resources };
}
