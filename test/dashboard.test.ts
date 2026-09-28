import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { fillDashboardTimeline, registerDashboardRoutes } from '../src/api/dashboard.js';
import type { ClickHouseRepository, DashboardSnapshot } from '../src/api/clickhouse.js';
import type { AuthSession, PostgresRepository } from '../src/api/postgres.js';

const session: AuthSession = {
  sessionId: '10000000-0000-4000-8000-000000000010',
  id: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000001',
  tenantName: 'ISP Teste',
  name: 'Operador',
  email: 'operador@example.com',
  role: 'operator',
  platformAdmin: false,
  expiresAt: '2026-08-08T18:00:00.000Z'
};
const cookie = `argus_session=${'x'.repeat(32)}`;
const snapshot: DashboardSnapshot = {
  summary: {
    rawRecords: 100,
    totalEvents: 80,
    allocations: 45,
    deallocations: 35,
    publicIps: 4,
    privateIps: 20,
    lastEventAt: '2026-08-07T18:00:00.000Z'
  },
  highlights: {
    publicMostAllocated: { ip: '198.51.100.1', eventCount: 20 },
    publicMostDeallocated: null,
    privateMostAllocated: { ip: '100.64.0.10', eventCount: 10 }
  },
  timeline: [{
    bucket: '2026-08-07T18:00:00Z', allocations: 2, deallocations: 1
  }]
};

describe('dashboard operacional', () => {
  it('mantém no gráfico as horas sem eventos', () => {
    const timeline = fillDashboardTimeline({
      points: [{
        bucket: '2026-08-07T11:00:00.000Z', allocations: 2, deallocations: 1
      }],
      from: new Date('2026-08-07T10:20:00.000Z'),
      to: new Date('2026-08-07T12:10:00.000Z'),
      bucket: 'hour'
    });
    expect(timeline).toHaveLength(3);
    expect(timeline.map((point) => point.allocations)).toEqual([0, 2, 0]);
  });

  it('aplica o tenant da sessão e o agrupamento do período', async () => {
    const calls: unknown[] = [];
    const postgres = { findActiveSession: async () => session } as unknown as PostgresRepository;
    const clickhouse = {
      getDashboardSnapshot: async (input: unknown) => {
        calls.push(input);
        return snapshot;
      }
    } as unknown as ClickHouseRepository;
    const app = Fastify();
    registerDashboardRoutes(app, { postgres, clickhouse });
    const response = await app.inject({ method: 'GET', url: '/v1/dashboard?period=7d', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().summary.totalEvents).toBe(80);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ tenantId: session.tenantId, bucket: 'day' });
    await app.close();
  });

  it('recusa período desconhecido', async () => {
    const postgres = { findActiveSession: async () => session } as unknown as PostgresRepository;
    const clickhouse = { getDashboardSnapshot: async () => snapshot } as unknown as ClickHouseRepository;
    const app = Fastify();
    registerDashboardRoutes(app, { postgres, clickhouse });
    const response = await app.inject({ method: 'GET', url: '/v1/dashboard?period=1y', headers: { cookie } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_dashboard_period' });
    await app.close();
  });
});
