import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from './auth.js';
import type { AuthSession, CompanyProfileFields, PostgresRepository } from './postgres.js';

function validCnpj(value: string): boolean {
  if (!value) return true;
  if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false;
  const digit = (length: number): number => {
    let sum = 0;
    let weight = length - 7;
    for (let index = 0; index < length; index += 1) {
      sum += Number(value[index]) * weight--;
      if (weight < 2) weight = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return digit(12) === Number(value[12]) && digit(13) === Number(value[13]);
}

const singleLine = (maximum: number) => z.string().trim().max(maximum).refine((value) => !/[\r\n]/.test(value), 'Valor inválido');
const normalizedCnpj = z.string().trim().max(18).transform((value) => value.replace(/\D/g, ''))
  .refine(validCnpj, 'CNPJ inválido');
const optionalEmail = z.string().trim().max(320).refine((value) => !value || z.string().email().safeParse(value).success, 'E-mail inválido');
const normalizedPostalCode = z.string().trim().max(10).transform((value) => value.replace(/\D/g, ''))
  .refine((value) => !value || /^\d{8}$/.test(value), 'CEP inválido');
const postalCodeParamsSchema = z.object({
  postalCode: z.string().transform((value) => value.replace(/\D/g, '')).refine((value) => /^\d{8}$/.test(value))
});
const viaCepResponseSchema = z.object({
  erro: z.boolean().optional(),
  cep: z.string().default(''),
  logradouro: z.string().default(''),
  bairro: z.string().default(''),
  localidade: z.string().default(''),
  uf: z.string().default('')
});

export interface PostalCodeAddress {
  postalCode: string;
  street: string;
  district: string;
  city: string;
  state: string;
}

export async function lookupViaCep(
  postalCode: string,
  fetchImplementation: typeof fetch = fetch
): Promise<PostalCodeAddress | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchImplementation(`https://viacep.com.br/ws/${postalCode}/json/`, {
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`viacep_http_${response.status}`);
    const parsed = viaCepResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('viacep_invalid_response');
    if (parsed.data.erro) return null;
    return {
      postalCode: parsed.data.cep.replace(/\D/g, '') || postalCode,
      street: parsed.data.logradouro.trim(),
      district: parsed.data.bairro.trim(),
      city: parsed.data.localidade.trim(),
      state: parsed.data.uf.trim().toUpperCase()
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const companyProfileFieldsSchema = z.object({
  legalName: singleLine(200),
  tradeName: singleLine(200),
  cnpj: normalizedCnpj,
  phone: singleLine(50),
  email: optionalEmail,
  postalCode: normalizedPostalCode,
  street: singleLine(250),
  addressNumber: singleLine(30),
  complement: singleLine(120),
  district: singleLine(120),
  city: singleLine(120),
  state: z.string().trim().toUpperCase().refine((value) => !value || /^[A-Z]{2}$/.test(value), 'UF inválida')
});

export const companyProfilePayloadSchema = companyProfileFieldsSchema.extend({
  logoDataUrl: z.string().max(750_000).nullable().optional(),
  removeLogo: z.boolean().default(false)
});

export function decodeCompanyLogo(dataUrl: string | null | undefined): {
  data?: Buffer;
  mime?: 'image/png' | 'image/jpeg';
} {
  if (!dataUrl) return {};
  const match = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('invalid_logo_format');
  const data = Buffer.from(match[2]!, 'base64');
  if (!data.length || data.length > 512 * 1024) throw new Error('invalid_logo_size');
  const mime = match[1] as 'image/png' | 'image/jpeg';
  const png = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9;
  if ((mime === 'image/png' && !png) || (mime === 'image/jpeg' && !jpeg)) throw new Error('invalid_logo_content');
  return { data, mime };
}

function requireTenantAdmin(session: AuthSession, reply: FastifyReply): boolean {
  if (session.role === 'admin') return true;
  void reply.code(403).send({ error: 'tenant_administrator_required' });
  return false;
}

function requirePlatformAdmin(session: AuthSession, reply: FastifyReply): boolean {
  if (session.platformAdmin) return true;
  void reply.code(403).send({ error: 'platform_administrator_required' });
  return false;
}

async function saveProfile(
  repository: PostgresRepository,
  session: AuthSession,
  tenantId: string,
  body: unknown,
  reply: FastifyReply
) {
  const parsed = companyProfilePayloadSchema.safeParse(body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_company_profile', details: parsed.error.flatten() });
  let logo: ReturnType<typeof decodeCompanyLogo>;
  try {
    logo = decodeCompanyLogo(parsed.data.logoDataUrl);
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : 'invalid_logo' });
  }
  const { logoDataUrl: _logoDataUrl, removeLogo, ...fields } = parsed.data;
  const profile = await repository.saveCompanyProfile({
    tenantId,
    actorUserId: session.id,
    fields: fields as CompanyProfileFields,
    ...(logo.data && logo.mime ? { logoData: logo.data, logoMime: logo.mime } : {}),
    removeLogo
  });
  if (!profile) return reply.code(404).send({ error: 'tenant_not_found' });
  return reply.send({ profile });
}

export function registerCompanyRoutes(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository;
  postalCodeLookup?: (postalCode: string) => Promise<PostalCodeAddress | null>;
}): void {
  const postalCodeLookup = dependencies.postalCodeLookup ?? lookupViaCep;

  app.get('/v1/address/postal-code/:postalCode', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    const params = postalCodeParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_postal_code' });
    try {
      const address = await postalCodeLookup(params.data.postalCode);
      if (!address) return reply.code(404).send({ error: 'postal_code_not_found' });
      return reply.send({ address });
    } catch (error) {
      request.log.warn({ error }, 'Falha ao consultar CEP');
      return reply.code(502).send({ error: 'postal_code_service_unavailable' });
    }
  });

  app.get('/v1/company-profile', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    const profile = await dependencies.postgres.getCompanyProfile(session.tenantId);
    if (!profile) return reply.code(404).send({ error: 'tenant_not_found' });
    return reply.send({ profile, canEdit: session.role === 'admin' });
  });

  app.put('/v1/company-profile', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session || !requireTenantAdmin(session, reply)) return;
    return saveProfile(dependencies.postgres, session, session.tenantId, request.body, reply);
  });

  app.get('/v1/company-profile/logo', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres);
    if (!session) return;
    const logo = await dependencies.postgres.getCompanyLogo(session.tenantId);
    if (!logo) return reply.code(404).send({ error: 'logo_not_found' });
    reply.type(logo.mime);
    return reply.send(logo.data);
  });

  app.get('/v1/platform/tenants/:tenantId/company-profile', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const params = z.object({ tenantId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_tenant_id' });
    const profile = await dependencies.postgres.getCompanyProfile(params.data.tenantId);
    if (!profile) return reply.code(404).send({ error: 'tenant_not_found' });
    return reply.send({ profile, canEdit: true });
  });

  app.put('/v1/platform/tenants/:tenantId/company-profile', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const params = z.object({ tenantId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_tenant_id' });
    return saveProfile(dependencies.postgres, session, params.data.tenantId, request.body, reply);
  });

  app.get('/v1/platform/tenants/:tenantId/company-profile/logo', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session || !requirePlatformAdmin(session, reply)) return;
    const params = z.object({ tenantId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_tenant_id' });
    const logo = await dependencies.postgres.getCompanyLogo(params.data.tenantId);
    if (!logo) return reply.code(404).send({ error: 'logo_not_found' });
    reply.type(logo.mime);
    return reply.send(logo.data);
  });
}
