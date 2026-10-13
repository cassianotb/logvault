import { describe, expect, it, vi } from 'vitest';
import { listIxcResource, testIxcApi } from '../src/api/ixc-client.js';

describe('cliente da API IXC', () => {
  it('usa POST, autenticação Basic e o cabeçalho listar exigido pelo IXC', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ total: '1', registros: [{ id: '10' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    const result = await listIxcResource({
      baseUrl: 'https://ixc.example.test/webservice/v1/',
      token: '42:test-token',
      resource: 'cliente',
      qtype: 'cliente.id',
      query: '10',
      fetcher
    });

    expect(result).toEqual({ total: 1, records: [{ id: '10' }] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://ixc.example.test/webservice/v1/cliente');
    expect(request).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(request?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('42:test-token').toString('base64')}`,
      ixcsoft: 'listar'
    });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      qtype: 'cliente.id', query: '10', oper: '=', page: '1', rp: '20'
    });
  });

  it('valida os quatro recursos necessários sem solicitar cadastros reais', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ total: '0', registros: [] }), { status: 200 }));
    const result = await testIxcApi({
      baseUrl: 'https://ixc.example.test/webservice/v1',
      token: '42:test-token',
      fetcher
    });

    expect(result.resources.map((item) => item.resource)).toEqual([
      'radacct', 'radusuarios', 'cliente', 'cliente_contrato'
    ]);
    expect(fetcher).toHaveBeenCalledTimes(4);
    for (const [, request] of fetcher.mock.calls) {
      expect(JSON.parse(String(request?.body)).query).toBe('-1');
    }
  });
});
