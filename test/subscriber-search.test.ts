import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerSearchRoutes } from '../src/api/search.js';
import type { ClickHouseRepository } from '../src/api/clickhouse.js';
import type { AuthSession, PostgresRepository } from '../src/api/postgres.js';
import type { SubscriberResolver } from '../src/api/subscribers.js';

const session: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010',
  id: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000001',
  tenantName: 'ISP Exemplo',
  tenantTimezone: 'America/Sao_Paulo',
  name: 'Operador',
  email: 'operador@example.com',
  role: 'operator',
  platformAdmin: false,
  expiresAt: '2026-08-14T12:00:00.000Z'
};

describe('correlação de assinante na consulta CGNAT', () => {
  it('anexa ao registro o assinante resolvido pelo IP privado e horário consultado', async () => {
    const row = {
      deviceId: '30000000-0000-4000-8000-000000000001',
      lastEventId: '40000000-0000-4000-8000-000000000001',
      publicIp: '198.51.100.14', privateIp: '100.65.170.202', protocol: 6, protocolName: 'TCP',
      portStart: 23040, portEnd: 23551, portMode: 'contiguous', portStep: null,
      lastEvent: 'allocated', lastEventAt: '2026-08-06T23:56:55.000Z', exactPortMatch: true
    };
    const postgres = {
      findActiveSession: async () => session,
      auditQuery: async () => '50000000-0000-4000-8000-000000000001'
    } as unknown as PostgresRepository;
    const clickhouse = { search: async () => [row] } as unknown as ClickHouseRepository;
    const subscriberResolver = vi.fn(async () => ({
      status: 'success' as const,
      provider: 'elleven' as const,
      subscribers: new Map([[row.privateIp, {
        status: 'identified' as const, provider: 'elleven' as const, name: 'Assinante Teste',
        taxId: '', identity: '', phone: '', email: '', username: 'login.teste', contractId: '10', contractNumber: '20',
        address: { postalCode: '', street: '', number: '', complement: '', district: '', city: '', state: '' },
        radiusSession: { startedAt: '2026-08-06T20:00:00.000Z', updatedAt: null, stoppedAt: null }
      }]])
    })) as SubscriberResolver;
    const app = Fastify();
    registerSearchRoutes(app, { postgres, clickhouse, subscriberResolver });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/cgnat/search?publicIp=198.51.100.14&at=2026-08-06T20%3A57%3A00&timezone=America%2FSao_Paulo&port=23040&correlateErp=true',
      headers: { cookie: `argus_session=${'x'.repeat(32)}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      erp: { status: 'success', provider: 'elleven' },
      results: [{ subscriber: { status: 'identified', name: 'Assinante Teste', username: 'login.teste' } }]
    });
    expect(subscriberResolver).toHaveBeenCalledWith({
      tenantId: session.tenantId,
      privateIps: [row.privateIp],
      at: '2026-08-06T23:57:00.000Z'
    });
    await app.close();
  });
});
