import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { companyProfilePayloadSchema, decodeCompanyLogo, lookupViaCep, registerCompanyRoutes } from '../src/api/company.js';
import type { AuthSession, PostgresRepository } from '../src/api/postgres.js';

const emptyProfile = {
  legalName: '', tradeName: '', cnpj: '', phone: '', email: '', postalCode: '', street: '',
  addressNumber: '', complement: '', district: '', city: '', state: '', removeLogo: false
};

describe('cadastro institucional', () => {
  it('aceita cadastro parcial e normaliza CNPJ, CEP e UF', () => {
    const parsed = companyProfilePayloadSchema.parse({
      ...emptyProfile,
      cnpj: '12.345.678/0001-95',
      postalCode: '89850-000',
      state: 'sc'
    });
    expect(parsed.cnpj).toBe('12345678000195');
    expect(parsed.postalCode).toBe('89850000');
    expect(parsed.state).toBe('SC');
  });

  it('recusa conteúdo que não corresponde ao tipo declarado do logotipo', () => {
    const fakePng = `data:image/png;base64,${Buffer.from('não é png').toString('base64')}`;
    expect(() => decodeCompanyLogo(fakePng)).toThrow('invalid_logo_content');
  });

  it('normaliza o endereço retornado pelo serviço de CEP', async () => {
    const address = await lookupViaCep('01001000', async () => new Response(JSON.stringify({
      cep: '01001-000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'sp'
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    expect(address).toEqual({
      postalCode: '01001000', street: 'Praça da Sé', district: 'Sé', city: 'São Paulo', state: 'SP'
    });
  });

  it('retorna endereço por CEP somente para usuário autenticado', async () => {
    const session: AuthSession = {
      sessionId: '10000000-0000-4000-8000-000000000010',
      id: '10000000-0000-4000-8000-000000000001',
      tenantId: '20000000-0000-4000-8000-000000000001',
      tenantName: 'ISP', tenantTimezone: 'America/Sao_Paulo', name: 'Administrador',
      email: 'admin@example.com', role: 'admin', platformAdmin: false,
      expiresAt: '2026-08-12T12:00:00.000Z'
    };
    const repository = { findActiveSession: async () => session } as unknown as PostgresRepository;
    const app = Fastify();
    registerCompanyRoutes(app, {
      postgres: repository,
      postalCodeLookup: async (postalCode) => ({
        postalCode, street: 'Rua Teste', district: 'Centro', city: 'Cidade', state: 'SC'
      })
    });
    const response = await app.inject({
      method: 'GET', url: '/v1/address/postal-code/89850-000',
      headers: { cookie: `argus_session=${'x'.repeat(32)}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().address).toEqual({
      postalCode: '89850000', street: 'Rua Teste', district: 'Centro', city: 'Cidade', state: 'SC'
    });
    await app.close();
  });

  it('diferencia CEP inexistente de indisponibilidade do serviço', async () => {
    const session = {
      sessionId: '10000000-0000-4000-8000-000000000010', id: '10000000-0000-4000-8000-000000000001',
      tenantId: '20000000-0000-4000-8000-000000000001', tenantName: 'ISP', tenantTimezone: 'America/Sao_Paulo',
      name: 'Administrador', email: 'admin@example.com', role: 'admin', platformAdmin: false,
      expiresAt: '2026-08-12T12:00:00.000Z'
    } satisfies AuthSession;
    const repository = { findActiveSession: async () => session } as unknown as PostgresRepository;
    const notFoundApp = Fastify();
    registerCompanyRoutes(notFoundApp, { postgres: repository, postalCodeLookup: async () => null });
    const notFound = await notFoundApp.inject({
      method: 'GET', url: '/v1/address/postal-code/99999999',
      headers: { cookie: `argus_session=${'x'.repeat(32)}` }
    });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toEqual({ error: 'postal_code_not_found' });
    await notFoundApp.close();

    const unavailableApp = Fastify();
    registerCompanyRoutes(unavailableApp, {
      postgres: repository,
      postalCodeLookup: async () => { throw new Error('offline'); }
    });
    const unavailable = await unavailableApp.inject({
      method: 'GET', url: '/v1/address/postal-code/01001000',
      headers: { cookie: `argus_session=${'x'.repeat(32)}` }
    });
    expect(unavailable.statusCode).toBe(502);
    expect(unavailable.json()).toEqual({ error: 'postal_code_service_unavailable' });
    await unavailableApp.close();
  });
});
