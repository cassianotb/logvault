import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerSearchRoutes } from '../src/api/search.js';
import type {
  CgnatAllocationCycle,
  CgnatCycleEvent,
  ClickHouseRepository
} from '../src/api/clickhouse.js';
import type { AuthSession, PostgresRepository } from '../src/api/postgres.js';

const tenantId = '20000000-0000-4000-8000-000000000001';
const allocationId = '40000000-0000-4000-8000-000000000001';
const deallocationId = '40000000-0000-4000-8000-000000000002';
const session: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010',
  id: '10000000-0000-4000-8000-000000000001',
  tenantId,
  tenantName: 'ISP Teste',
  tenantTimezone: 'America/Sao_Paulo',
  name: 'Operador',
  email: 'operador@example.com',
  role: 'operator',
  platformAdmin: false,
  expiresAt: '2026-08-12T12:00:00.000Z'
};
const cookie = `argus_session=${'x'.repeat(32)}`;
const allocation: CgnatCycleEvent = {
  eventId: allocationId,
  deviceId: '30000000-0000-4000-8000-000000000001',
  eventAt: '2026-08-06T20:00:00.000Z',
  receivedAt: '2026-08-06T20:00:01.000Z',
  publicIp: '198.51.100.14',
  privateIp: '100.65.170.202',
  protocol: 6,
  protocolName: 'TCP',
  portStart: 23040,
  portEnd: 23551,
  portMode: 'contiguous',
  portStep: 1,
  eventType: 'allocated'
};
const deallocation: CgnatCycleEvent = {
  ...allocation,
  eventId: deallocationId,
  eventAt: '2026-08-06T20:05:30.000Z',
  receivedAt: '2026-08-06T20:05:31.000Z',
  eventType: 'deallocated'
};

function cycle(status: CgnatAllocationCycle['status']): CgnatAllocationCycle {
  return {
    status,
    allocation,
    deallocation: status === 'closed' ? deallocation : null,
    conflictingAllocation: status === 'ambiguous' ? { ...deallocation, eventType: 'allocated' } : null,
    durationSeconds: status === 'closed' ? 330 : null
  };
}

describe('consulta do ciclo de uma alocação', () => {
  it.each(['closed', 'open', 'ambiguous'] as const)('expõe o estado %s sem refazer a pesquisa principal', async (status) => {
    const calls: unknown[] = [];
    const postgres = { findActiveSession: async () => session } as unknown as PostgresRepository;
    const clickhouse = {
      getAllocationCycle: async (input: unknown) => {
        calls.push(input);
        return cycle(status);
      }
    } as unknown as ClickHouseRepository;
    const app = Fastify();
    registerSearchRoutes(app, { postgres, clickhouse });
    const response = await app.inject({
      method: 'GET',
      url: `/v1/cgnat/events/${allocationId}/cycle`,
      headers: { cookie }
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json().cycle.status).toBe(status);
    expect(calls).toEqual([{ tenantId, eventId: allocationId }]);
    await app.close();
  });

  it('não permite acessar evento fora do tenant autenticado', async () => {
    const calls: unknown[] = [];
    const postgres = { findActiveSession: async () => session } as unknown as PostgresRepository;
    const clickhouse = {
      getAllocationCycle: async (input: unknown) => {
        calls.push(input);
        return null;
      }
    } as unknown as ClickHouseRepository;
    const app = Fastify();
    registerSearchRoutes(app, { postgres, clickhouse });
    const response = await app.inject({
      method: 'GET',
      url: `/v1/cgnat/events/${allocationId}/cycle`,
      headers: { cookie }
    });
    expect(response.statusCode).toBe(404);
    expect(calls).toEqual([{ tenantId, eventId: allocationId }]);
    await app.close();
  });

  it('recusa um identificador de evento inválido', async () => {
    const postgres = { findActiveSession: async () => session } as unknown as PostgresRepository;
    const clickhouse = { getAllocationCycle: async () => cycle('open') } as unknown as ClickHouseRepository;
    const app = Fastify();
    registerSearchRoutes(app, { postgres, clickhouse });
    const response = await app.inject({ method: 'GET', url: '/v1/cgnat/events/invalido/cycle', headers: { cookie } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_event_id' });
    await app.close();
  });
});
