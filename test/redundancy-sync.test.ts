import { describe, expect, it, vi } from 'vitest';
import { startRedundancyConfigurationSync } from '../src/api/redundancy.js';
import type { PostgresRepository, RedundancyConfigurationSnapshot } from '../src/api/postgres.js';

const snapshot: RedundancyConfigurationSnapshot = {
  generatedAt: '2026-09-30T12:00:00.000Z', authorityEpoch: 1, configurationRevision: 2,
  tenants: [], users: [], servicePlans: [], tenantPlanAssignments: [], companyProfiles: [],
  collectors: [], devices: [], firewallPolicies: [], firewallAuthorizations: []
};

describe('sincronização da redundância', () => {
  it('aplica a configuração e confirma a presença do secundário', async () => {
    const applied: RedundancyConfigurationSnapshot[] = [];
    const repository = {
      applyRedundancyConfiguration: async (value: RedundancyConfigurationSnapshot) => { applied.push(value); }
    } as unknown as PostgresRepository;
    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = String(input);
      return url.endsWith('/configuration')
        ? new Response(JSON.stringify(snapshot), { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ status: 'recorded' }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const stop = startRedundancyConfigurationSync({
      postgres: repository, primaryUrl: 'https://primary.example.com',
      siteId: '10000000-0000-4000-8000-000000000001', siteToken: 'secret',
      applicationVersion: '1.1.0', intervalMs: 300000, fetchImpl
    });
    await vi.waitFor(() => expect(applied).toHaveLength(1));
    expect(applied[0]).toEqual(snapshot);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const configurationCall = fetchImpl.mock.calls[0];
    const heartbeatCall = fetchImpl.mock.calls[1];
    expect(String(configurationCall?.[0])).toBe('https://primary.example.com/api/v1/redundancy/configuration');
    expect(String(heartbeatCall?.[0])).toBe('https://primary.example.com/api/v1/redundancy/heartbeat');
    stop();
  });

  it('preserva o estado local e relata falha quando o primário está indisponível', async () => {
    const apply = vi.fn();
    const onError = vi.fn();
    const stop = startRedundancyConfigurationSync({
      postgres: { applyRedundancyConfiguration: apply } as unknown as PostgresRepository,
      primaryUrl: 'https://primary.example.com',
      siteId: '10000000-0000-4000-8000-000000000001', siteToken: 'secret',
      applicationVersion: '1.1.0', intervalMs: 300000,
      fetchImpl: async () => new Response('', { status: 503 }), onError
    });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(apply).not.toHaveBeenCalled();
    stop();
  });
});
