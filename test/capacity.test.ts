import { describe, expect, it } from 'vitest';
import { buildCapacityReport, buildPlatformCapacityReport, buildStorageEstimate } from '../src/api/capacity.js';

describe('dimensionamento de capacidade', () => {
  it('usa a maior taxa observada e mantém margem explícita', () => {
    const report = buildCapacityReport({
      snapshot: {
        devices: [{
          deviceId: '10000000-0000-4000-8000-000000000001',
          rawRecords5m: 600,
          rawRecords1h: 3600,
          rawRecords24h: 7200,
          events5m: 300,
          events1h: 1800,
          events24h: 3600,
          lastReceivedAt: '2026-08-07T18:00:00.000Z'
        }],
        peakRawRecordsPerSecond24h: 8,
        peakEventsPerSecond24h: 5,
        physicalRawBytes: 100_000,
        physicalEventBytes: 50_000,
        physicalRawRows: 1_000,
        physicalEventRows: 1_000,
        tenantRawRows: 1_000,
        tenantEventRows: 1_000,
        firstReceivedAt: '2026-08-06T18:00:00.000Z',
        lastReceivedAt: '2026-08-07T18:00:00.000Z'
      },
      devices: [{
        id: '10000000-0000-4000-8000-000000000001', collectorId: null, name: 'ASR', vendor: 'cisco',
        model: null, exporterIp: '192.0.2.1', timezone: 'America/Sao_Paulo', enabled: true
      }],
      collectors: [{
        id: '20000000-0000-4000-8000-000000000001', name: 'Coletor', mode: 'edge', configuredStatus: 'active',
        version: '1', deviceCount: 1, lastSeenAt: null, telemetrySentAt: null, pendingRecords: 0, pendingEvents: 0,
        pendingBatches: 0, acknowledgedRecordsRetained: 1_000, oldestPendingAt: null, spoolBytes: 1_000_000,
        lastSyncAt: null, lastSyncError: '', batches24h: 0, rawRecords24h: 0, events24h: 0
      }],
      queryPerformance: { samples24h: 2, averageMs: 10, p95Ms: 15, maximumMs: 16 },
      offlineHours: 6
    });

    expect(report.overview.rawRecordsPerSecond5m).toBe(2);
    expect(report.storage.projectedDailyBytes).toBe(21_600_000);
    expect(report.storage.recommendedRetentionBytes).toBe(report.storage.projectedRetentionBytes * 1.3);
    expect(report.spool.estimatedOfflineBytes).toBe(43_200_000);
    expect(report.storage.coverageDays).toBe(1);
  });

  it('estima armazenamento comercial por assinantes e mistura de vendors', () => {
    const cisco = buildStorageEstimate({
      subscribers: 1_000,
      ciscoPercent: 100,
      growthPercent: 0,
      headroomPercent: 30,
      offlineHours: 6
    });

    expect(cisco.estimate.baselineMonthlyBytes).toBe(720_000_000);
    expect(cisco.estimate.recommendedMonthlyBytes).toBe(936_000_000);
    expect(cisco.estimate.retentionBytes).toBe(12_168_000_000);
    expect(cisco.estimate.backupBytes).toBe(468_000_000);
    expect(cisco.estimate.recommendedDiskBytes).toBeCloseTo(14_040_000_000);
    expect(cisco.edge.windowHours).toBe(30);
    expect(cisco.edge.recommendedSpoolBytes).toBeCloseTo(880_620_000);
    expect(cisco.edge.recommendedDiskBytes).toBe(30_000_000_000);

    const mixed = buildStorageEstimate({
      subscribers: 10_000,
      ciscoPercent: 50,
      growthPercent: 20,
      headroomPercent: 30,
      offlineHours: 6
    });

    expect(mixed.input.projectedSubscribers).toBe(12_000);
    expect(mixed.assumptions.weightedMonthlyGbPerThousand).toBeCloseTo(0.625);
    expect(mixed.estimate.baselineMonthlyBytes).toBe(7_500_000_000);
    expect(mixed.estimate.recommendedDiskBytes).toBeCloseTo(146_250_000_000);
    expect(mixed.edge.recommendedSpoolBytes).toBeCloseTo(8_349_120_000);
    expect(mixed.edge.recommendedDiskBytes).toBeCloseTo(35_436_400_000);
  });

  it('consolida a plataforma sem duplicar o armazenamento físico compartilhado', () => {
    const tenantReport = (tenantRows: number, projectedDailyBytes: number) => ({
      generatedAt: '2026-08-13T12:00:00.000Z',
      basis: {
        retentionMonths: 13, estimatedRetentionDays: 396, offlineHours: 6,
        headroomPercent: 30, projectionWindow: 'highest_rate_5m_1h_24h'
      },
      overview: {
        configuredDevices: 1, enabledDevices: 1, rawRecords24h: 100, events24h: 80,
        rawRecordsPerSecond5m: 2, eventsPerSecond5m: 1,
        peakRawRecordsPerSecond24h: 4, peakEventsPerSecond24h: 3
      },
      storage: {
        instancePhysicalBytes: 1_000_000, tenantEstimatedCurrentBytes: tenantRows,
        rawBytesPerRecord: 1, eventBytesPerRecord: 1,
        projectedDailyBytes, projectedRetentionBytes: projectedDailyBytes * 396,
        recommendedRetentionBytes: projectedDailyBytes * 396 * 1.3,
        firstReceivedAt: '2026-08-01T00:00:00.000Z', lastReceivedAt: '2026-08-13T00:00:00.000Z',
        coverageDays: 12
      },
      spool: {
        collectorsMeasured: 1, bytesPerRawRecord: 10,
        estimatedOfflineBytes: 1000, recommendedOfflineBytes: 1300
      },
      queryPerformance: { samples24h: 1, averageMs: 10, p95Ms: 12, maximumMs: 13 },
      devices: []
    });
    const report = buildPlatformCapacityReport({
      tenants: [
        { id: 'tenant-1', name: 'ISP Um', active: true, report: tenantReport(400_000, 10_000) },
        { id: 'tenant-2', name: 'ISP Dois', active: false, report: tenantReport(600_000, 20_000) }
      ]
    });

    expect(report.scope).toBe('platform');
    expect(report.storage.instancePhysicalBytes).toBe(1_000_000);
    expect(report.storage.tenantEstimatedCurrentBytes).toBe(1_000_000);
    expect(report.storage.projectedDailyBytes).toBe(30_000);
    expect(report.overview.customerTenants).toBe(2);
    expect(report.overview.activeTenants).toBe(1);
    expect(report.tenants[0]).toMatchObject({ name: 'ISP Dois', estimatedCurrentBytes: 600_000 });
  });
});
