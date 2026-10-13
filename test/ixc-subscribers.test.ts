import { describe, expect, it, vi } from 'vitest';
import { sealSecret } from '../src/core/secret-box.js';
import { resolveIxcSubscribers } from '../src/api/ixc-subscribers.js';
import type { ErpIntegrationRecord } from '../src/api/postgres.js';

const encryptionKey = 's'.repeat(32);

describe('correlação histórica de assinantes no IXC', () => {
  it('identifica a sessão do horário consultado e informa o estado atual do contrato, mesmo inativo', async () => {
    const responses: Record<string, Array<Record<string, unknown>>> = {
      radacct: [{
        radacctid: '900', username: 'login.demo', framedipaddress: '100.64.91.40',
        acctstarttime: '2026-09-28 05:11:23', acctupdatetime: '2026-10-07 16:30:00', acctstoptime: ''
      }],
      radusuarios: [{
        id: '300', login: 'login.demo', id_cliente: '200', id_contrato: '249608',
        cep: '88000000', endereco: 'Rua da Instalação', numero: '42', bairro: 'Centro', cidade: 'Florianópolis', uf: 'SC'
      }],
      cliente: [{
        id: '200', razao: 'Cliente Demonstração Ltda.', cnpj_cpf: '00.000.000/0001-00',
        ie_identidade: 'ISENTO', telefone_celular: '(48) 99999-0000', email: 'cliente@example.test'
      }],
      cliente_contrato: [{ id: '249608', contrato: '249608', status: 'I' }]
    };
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const resource = new URL(String(url)).pathname.split('/').at(-1)!;
      const records = responses[resource] ?? [];
      return new Response(JSON.stringify({ total: String(records.length), registros: records }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    });
    const record: ErpIntegrationRecord = {
      tenantId: '20000000-0000-4000-8000-000000000001',
      provider: 'ixc',
      baseUrl: 'https://ixc.example.test/webservice/v1',
      secretRef: sealSecret(JSON.stringify({ token: '42:test-token' }), encryptionKey),
      settings: { version: 1, lastTest: { status: 'success' } },
      enabled: true,
      createdAt: '2026-10-13T12:00:00.000Z'
    };

    const resolution = await resolveIxcSubscribers(
      record,
      encryptionKey,
      ['100.64.91.40'],
      '2026-10-07T19:31:46.000Z',
      'America/Sao_Paulo',
      fetcher
    );

    expect(resolution.status).toBe('success');
    expect(resolution.provider).toBe('ixc');
    expect(resolution.subscribers.get('100.64.91.40')).toMatchObject({
      status: 'identified',
      provider: 'ixc',
      name: 'Cliente Demonstração Ltda.',
      username: 'login.demo',
      contractId: '249608',
      contractStatus: 'Inativo',
      radiusSession: { startedAt: '2026-09-28T08:11:23.000Z', stoppedAt: null }
    });
    const requests = fetcher.mock.calls.map(([url, init]) => ({
      resource: new URL(String(url)).pathname.split('/').at(-1),
      body: JSON.parse(String(init?.body)) as Record<string, string>
    }));
    expect(requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ resource: 'radacct', body: expect.objectContaining({ qtype: 'radacct.framedipaddress', query: '100.64.91.40' }) }),
      expect.objectContaining({ resource: 'radusuarios', body: expect.objectContaining({ qtype: 'radusuarios.login', query: 'login.demo' }) })
    ]));
  });
});
