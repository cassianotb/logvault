import { createSign } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

export interface GoogleServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

export function parseGoogleServiceAccount(value: string): GoogleServiceAccountCredentials {
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new Error('JSON da conta de serviço inválido'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('Conta de serviço inválida');
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.client_email !== 'string' || !candidate.client_email.includes('@')) {
    throw new Error('client_email ausente na conta de serviço');
  }
  if (typeof candidate.private_key !== 'string' || !candidate.private_key.includes('BEGIN PRIVATE KEY')) {
    throw new Error('private_key ausente na conta de serviço');
  }
  if (candidate.token_uri !== undefined && (typeof candidate.token_uri !== 'string' || candidate.token_uri !== 'https://oauth2.googleapis.com/token')) {
    throw new Error('token_uri da conta de serviço não é permitido');
  }
  return {
    client_email: candidate.client_email,
    private_key: candidate.private_key,
    ...(typeof candidate.token_uri === 'string' ? { token_uri: candidate.token_uri } : {})
  };
}

async function accessToken(credentials: GoogleServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = credentials.token_uri ?? 'https://oauth2.googleapis.com/token';
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: tokenUri,
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credentials.private_key).toString('base64url')}`;
  const response = await fetch(tokenUri, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(15_000)
  });
  const body = await response.json().catch(() => ({})) as { access_token?: unknown; error_description?: unknown };
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(typeof body.error_description === 'string' ? body.error_description : `Google OAuth respondeu ${response.status}`);
  }
  return body.access_token;
}

function validDriveId(value: string): boolean {
  return /^[A-Za-z0-9_-]{10,200}$/.test(value);
}

export async function testGoogleDriveFolder(input: {
  credentials: GoogleServiceAccountCredentials;
  folderId: string;
}): Promise<{ id: string; name: string }> {
  if (!validDriveId(input.folderId)) throw new Error('ID da pasta do Google Drive inválido');
  const token = await accessToken(input.credentials);
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${input.folderId}`);
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('fields', 'id,name,mimeType,driveId,capabilities(canAddChildren)');
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => ({})) as {
    id?: unknown; name?: unknown; mimeType?: unknown; driveId?: unknown;
    capabilities?: { canAddChildren?: unknown }; error?: { message?: unknown };
  };
  if (!response.ok) throw new Error(typeof body.error?.message === 'string' ? body.error.message : `Google Drive respondeu ${response.status}`);
  if (body.mimeType !== 'application/vnd.google-apps.folder' || body.capabilities?.canAddChildren !== true) {
    throw new Error('A conta de serviço não pode gravar na pasta informada');
  }
  if (typeof body.driveId !== 'string' || !body.driveId) {
    throw new Error('A pasta precisa pertencer a um Drive compartilhado; contas de serviço não possuem cota no Meu Drive');
  }
  const probeUrl = new URL('https://www.googleapis.com/drive/v3/files');
  probeUrl.searchParams.set('supportsAllDrives', 'true');
  probeUrl.searchParams.set('fields', 'id');
  const probe = await fetch(probeUrl, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: `.logvault-write-test-${Date.now()}`, parents: [input.folderId], mimeType: 'application/octet-stream'
    }),
    signal: AbortSignal.timeout(15_000)
  });
  const probeBody = await probe.json().catch(() => ({})) as { id?: unknown; error?: { message?: unknown } };
  if (!probe.ok || typeof probeBody.id !== 'string') {
    throw new Error(typeof probeBody.error?.message === 'string' ? probeBody.error.message : `Google Drive recusou o teste de escrita (${probe.status})`);
  }
  const deleteUrl = new URL(`https://www.googleapis.com/drive/v3/files/${probeBody.id}`);
  deleteUrl.searchParams.set('supportsAllDrives', 'true');
  const deleted = await fetch(deleteUrl, {
    method: 'DELETE', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000)
  });
  if (!deleted.ok) throw new Error(`O arquivo de teste foi criado, mas não pôde ser removido (${deleted.status})`);
  return { id: String(body.id), name: String(body.name) };
}

export async function uploadGoogleDriveFile(input: {
  credentials: GoogleServiceAccountCredentials;
  folderId: string;
  filePath: string;
  fileName: string;
  appProperties: Record<string, string>;
}): Promise<{ id: string; name: string }> {
  if (!validDriveId(input.folderId)) throw new Error('ID da pasta do Google Drive inválido');
  if (!/^[A-Za-z0-9._-]{1,240}$/.test(input.fileName)) throw new Error('Nome do backup externo inválido');
  const file = await stat(input.filePath);
  const token = await accessToken(input.credentials);
  const startUrl = new URL('https://www.googleapis.com/upload/drive/v3/files');
  startUrl.searchParams.set('uploadType', 'resumable');
  startUrl.searchParams.set('supportsAllDrives', 'true');
  startUrl.searchParams.set('fields', 'id,name');
  const started = await fetch(startUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': 'application/octet-stream',
      'x-upload-content-length': String(file.size)
    },
    body: JSON.stringify({
      name: input.fileName,
      parents: [input.folderId],
      mimeType: 'application/octet-stream',
      appProperties: input.appProperties
    }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!started.ok) {
    const error = await started.json().catch(() => ({})) as { error?: { message?: unknown } };
    throw new Error(typeof error.error?.message === 'string' ? error.error.message : `Google Drive respondeu ${started.status}`);
  }
  const sessionUrl = started.headers.get('location');
  if (!sessionUrl?.startsWith('https://www.googleapis.com/')) throw new Error('Google Drive não devolveu uma sessão de upload segura');
  const uploaded = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', 'content-length': String(file.size) },
    body: createReadStream(input.filePath) as unknown as BodyInit,
    duplex: 'half',
    signal: AbortSignal.timeout(3_600_000)
  } as RequestInit & { duplex: 'half' });
  const body = await uploaded.json().catch(() => ({})) as { id?: unknown; name?: unknown; error?: { message?: unknown } };
  if (!uploaded.ok || typeof body.id !== 'string') {
    throw new Error(typeof body.error?.message === 'string' ? body.error.message : `Upload ao Google Drive respondeu ${uploaded.status}`);
  }
  return { id: body.id, name: typeof body.name === 'string' ? body.name : input.fileName };
}

export async function pruneGoogleDriveBackups(input: {
  credentials: GoogleServiceAccountCredentials;
  folderId: string;
  scope: 'platform' | 'tenant';
  retentionDays: number;
}): Promise<number> {
  if (!validDriveId(input.folderId)) throw new Error('ID da pasta do Google Drive inválido');
  const token = await accessToken(input.credentials);
  const cutoff = Date.now() - input.retentionDays * 86_400_000;
  let pageToken = '';
  let removed = 0;
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${input.folderId}' in parents and trashed = false and appProperties has { key='logvaultScope' and value='${input.scope}' }`);
    url.searchParams.set('spaces', 'drive');
    url.searchParams.set('corpora', 'allDrives');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('fields', 'nextPageToken,files(id,createdTime)');
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
    const body = await response.json().catch(() => ({})) as {
      nextPageToken?: unknown; files?: Array<{ id?: unknown; createdTime?: unknown }>; error?: { message?: unknown };
    };
    if (!response.ok) throw new Error(typeof body.error?.message === 'string' ? body.error.message : `Google Drive respondeu ${response.status}`);
    for (const file of body.files ?? []) {
      if (typeof file.id !== 'string' || typeof file.createdTime !== 'string' || Date.parse(file.createdTime) >= cutoff) continue;
      const deleteUrl = new URL(`https://www.googleapis.com/drive/v3/files/${file.id}`);
      deleteUrl.searchParams.set('supportsAllDrives', 'true');
      const deleted = await fetch(deleteUrl, {
        method: 'DELETE', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000)
      });
      if (!deleted.ok) throw new Error(`Google Drive recusou a exclusão do backup antigo (${deleted.status})`);
      removed += 1;
    }
    pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : '';
  } while (pageToken);
  return removed;
}
