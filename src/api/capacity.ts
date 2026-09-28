import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from './auth.js';
import type { CapacitySnapshot, ClickHouseRepository } from './clickhouse.js';
import type { CollectorStatusRecord, DeviceDefinition, PostgresRepository } from './postgres.js';

const RETENTION_MONTHS = 13;
const ESTIMATED_RETENTION_DAYS = 396;
const HEADROOM_FACTOR = 1.3;
const STORAGE_CALCULATOR = {
  ciscoMonthlyGbPerThousand: 0.72,
  a10MonthlyGbPerThousand: 0.53,
  retentionMonths: 13,
  backupDays: 15,
  targetDiskUtilizationPercent: 90,
  ciscoEdgeMbPerThousandHour: 22.58,
  a10EdgeMbPerThousandHour: 13.10,
  edgeAcknowledgedRetentionHours: 24,
  edgeSystemReserveGb: 20,
  edgeTargetDiskUtilizationPercent: 80,
  edgeMinimumDiskGb: 30
} as const;

const storageEstimateSchema = z.object({
  subscribers: z.coerce.number().int().min(1).max(10_000_000),
  ciscoPercent: z.coerce.number().min(0).max(100),
  growthPercent: z.coerce.number().min(0).max(500).default(0),
  headroomPercent: z.coerce.number().min(0).max(100).default(30),
  offlineHours: z.coerce.number().int().min(1).max(168).default(6)
});

export function buildStorageEstimate(input: {
  subscribers: number;
  ciscoPercent: number;
  growthPercent: number;
  headroomPercent: number;
  offlineHours: number;
}) {
  const a10Percent = 100 - input.ciscoPercent;
  const projectedSubscribers = Math.ceil(input.subscribers * (1 + input.growthPercent / 100));
  const weightedMonthlyGbPerThousand = (
    STORAGE_CALCULATOR.ciscoMonthlyGbPerThousand * input.ciscoPercent
    + STORAGE_CALCULATOR.a10MonthlyGbPerThousand * a10Percent
  ) / 100;
  const baselineMonthlyBytes = projectedSubscribers / 1_000 * weightedMonthlyGbPerThousand * 1_000_000_000;
  const recommendedMonthlyBytes = baselineMonthlyBytes * (1 + input.headroomPercent / 100);
  const retentionBytes = recommendedMonthlyBytes * STORAGE_CALCULATOR.retentionMonths;
  const backupBytes = recommendedMonthlyBytes * STORAGE_CALCULATOR.backupDays / 30;
  const allocatedBytes = retentionBytes + backupBytes;
  const recommendedDiskBytes = allocatedBytes / (STORAGE_CALCULATOR.targetDiskUtilizationPercent / 100);
  const weightedEdgeMbPerThousandHour = (
    STORAGE_CALCULATOR.ciscoEdgeMbPerThousandHour * input.ciscoPercent
    + STORAGE_CALCULATOR.a10EdgeMbPerThousandHour * a10Percent
  ) / 100;
  const edgeWindowHours = STORAGE_CALCULATOR.edgeAcknowledgedRetentionHours + input.offlineHours;
  const edgeBaselineSpoolBytes = projectedSubscribers / 1_000
    * weightedEdgeMbPerThousandHour * 1_000_000 * edgeWindowHours;
  const edgeRecommendedSpoolBytes = edgeBaselineSpoolBytes * (1 + input.headroomPercent / 100);
  const edgeSystemReserveBytes = STORAGE_CALCULATOR.edgeSystemReserveGb * 1_000_000_000;
  const edgeCalculatedDiskBytes = (edgeRecommendedSpoolBytes + edgeSystemReserveBytes)
    / (STORAGE_CALCULATOR.edgeTargetDiskUtilizationPercent / 100);
  const edgeRecommendedDiskBytes = Math.max(
    STORAGE_CALCULATOR.edgeMinimumDiskGb * 1_000_000_000,
    edgeCalculatedDiskBytes
  );

  return {
    input: {
      subscribers: input.subscribers,
      projectedSubscribers,
      ciscoPercent: input.ciscoPercent,
      a10Percent,
      growthPercent: input.growthPercent,
      headroomPercent: input.headroomPercent,
      offlineHours: input.offlineHours
    },
    assumptions: {
      ...STORAGE_CALCULATOR,
      weightedMonthlyGbPerThousand
    },
    estimate: {
      baselineMonthlyBytes,
      recommendedMonthlyBytes,
      retentionBytes,
      backupBytes,
      operationalFreeBytes: recommendedDiskBytes - allocatedBytes,
      recommendedDiskBytes
    },
    edge: {
      windowHours: edgeWindowHours,
      weightedMbPerThousandHour: weightedEdgeMbPerThousandHour,
      baselineSpoolBytes: edgeBaselineSpoolBytes,
      recommendedSpoolBytes: edgeRecommendedSpoolBytes,
      systemReserveBytes: edgeSystemReserveBytes,
      operationalFreeBytes: edgeRecommendedDiskBytes
        * (1 - STORAGE_CALCULATOR.edgeTargetDiskUtilizationPercent / 100),
      recommendedDiskBytes: edgeRecommendedDiskBytes
    }
  };
}

function rate(count: number, seconds: number): number {
  return count / seconds;
}

function projectedDailyCount(fiveMinutes: number, oneHour: number, twentyFourHours: number): number {
  return Math.max(fiveMinutes * 288, oneHour * 24, twentyFourHours);
}

export function buildCapacityReport(input: {
  snapshot: CapacitySnapshot;
  devices: DeviceDefinition[];
  collectors: CollectorStatusRecord[];
  queryPerformance: { samples24h: number; averageMs: number | null; p95Ms: number | null; maximumMs: number | null };
  offlineHours: number;
}) {
  const rawBytesPerRow = input.snapshot.physicalRawRows > 0
    ? input.snapshot.physicalRawBytes / input.snapshot.physicalRawRows
    : 0;
  const eventBytesPerRow = input.snapshot.physicalEventRows > 0
    ? input.snapshot.physicalEventBytes / input.snapshot.physicalEventRows
    : 0;
  const deviceActivity = new Map(input.snapshot.devices.map((device) => [device.deviceId, device]));
  const deviceRows = input.devices.map((device) => {
    const activity = deviceActivity.get(device.id);
    const raw5m = activity?.rawRecords5m ?? 0;
    const raw1h = activity?.rawRecords1h ?? 0;
    const raw24h = activity?.rawRecords24h ?? 0;
    const events5m = activity?.events5m ?? 0;
    const events1h = activity?.events1h ?? 0;
    const events24h = activity?.events24h ?? 0;
    const projectedRawDaily = projectedDailyCount(raw5m, raw1h, raw24h);
    const projectedEventsDaily = projectedDailyCount(events5m, events1h, events24h);
    const projectedDailyBytes = projectedRawDaily * rawBytesPerRow + projectedEventsDaily * eventBytesPerRow;
    return {
      id: device.id,
      name: device.name,
      vendor: device.vendor,
      exporterIp: device.exporterIp,
      enabled: device.enabled,
      rawRecords24h: raw24h,
      events24h,
      rawRecordsPerSecond5m: rate(raw5m, 300),
      eventsPerSecond5m: rate(events5m, 300),
      projectedDailyBytes,
      projectedRetentionBytes: projectedDailyBytes * ESTIMATED_RETENTION_DAYS,
      lastReceivedAt: activity?.lastReceivedAt ?? null
    };
  });

  const totals = input.snapshot.devices.reduce((current, device) => ({
    raw5m: current.raw5m + device.rawRecords5m,
    raw1h: current.raw1h + device.rawRecords1h,
    raw24h: current.raw24h + device.rawRecords24h,
    events5m: current.events5m + device.events5m,
    events1h: current.events1h + device.events1h,
    events24h: current.events24h + device.events24h
  }), { raw5m: 0, raw1h: 0, raw24h: 0, events5m: 0, events1h: 0, events24h: 0 });
  const projectedRawDaily = projectedDailyCount(totals.raw5m, totals.raw1h, totals.raw24h);
  const projectedEventsDaily = projectedDailyCount(totals.events5m, totals.events1h, totals.events24h);
  const projectedDailyBytes = projectedRawDaily * rawBytesPerRow + projectedEventsDaily * eventBytesPerRow;
  const retainedSpoolRecords = input.collectors.reduce(
    (sum, collector) => sum + collector.pendingRecords + collector.acknowledgedRecordsRetained,
    0
  );
  const spoolBytes = input.collectors.reduce((sum, collector) => sum + collector.spoolBytes, 0);
  const spoolBytesPerRawRecord = retainedSpoolRecords > 0 ? spoolBytes / retainedSpoolRecords : null;
  const rawRateForSizing = Math.max(rate(totals.raw5m, 300), rate(totals.raw1h, 3600), rate(totals.raw24h, 86400));
  const offlineSpoolBytes = spoolBytesPerRawRecord === null
    ? null
    : rawRateForSizing * input.offlineHours * 3600 * spoolBytesPerRawRecord;
  const firstMs = input.snapshot.firstReceivedAt ? Date.parse(input.snapshot.firstReceivedAt) : Number.NaN;
  const lastMs = input.snapshot.lastReceivedAt ? Date.parse(input.snapshot.lastReceivedAt) : Number.NaN;
  const coverageDays = Number.isFinite(firstMs) && Number.isFinite(lastMs)
    ? Math.max(0, (lastMs - firstMs) / 86_400_000)
    : null;

  return {
    generatedAt: new Date().toISOString(),
    basis: {
      retentionMonths: RETENTION_MONTHS,
      estimatedRetentionDays: ESTIMATED_RETENTION_DAYS,
      offlineHours: input.offlineHours,
      headroomPercent: Math.round((HEADROOM_FACTOR - 1) * 100),
      projectionWindow: 'highest_rate_5m_1h_24h'
    },
    overview: {
      configuredDevices: input.devices.length,
      enabledDevices: input.devices.filter((device) => device.enabled).length,
      rawRecords24h: totals.raw24h,
      events24h: totals.events24h,
      rawRecordsPerSecond5m: rate(totals.raw5m, 300),
      eventsPerSecond5m: rate(totals.events5m, 300),
      peakRawRecordsPerSecond24h: input.snapshot.peakRawRecordsPerSecond24h,
      peakEventsPerSecond24h: input.snapshot.peakEventsPerSecond24h
    },
    storage: {
      instancePhysicalBytes: input.snapshot.physicalRawBytes + input.snapshot.physicalEventBytes,
      tenantEstimatedCurrentBytes: input.snapshot.tenantRawRows * rawBytesPerRow + input.snapshot.tenantEventRows * eventBytesPerRow,
      rawBytesPerRecord: rawBytesPerRow,
      eventBytesPerRecord: eventBytesPerRow,
      projectedDailyBytes,
      projectedRetentionBytes: projectedDailyBytes * ESTIMATED_RETENTION_DAYS,
      recommendedRetentionBytes: projectedDailyBytes * ESTIMATED_RETENTION_DAYS * HEADROOM_FACTOR,
      firstReceivedAt: input.snapshot.firstReceivedAt,
      lastReceivedAt: input.snapshot.lastReceivedAt,
      coverageDays
    },
    spool: {
      collectorsMeasured: input.collectors.length,
      pendingRecords: input.collectors.reduce((sum, collector) => sum + collector.pendingRecords, 0),
      pendingEvents: input.collectors.reduce((sum, collector) => sum + collector.pendingEvents, 0),
      bytesPerRawRecord: spoolBytesPerRawRecord,
      estimatedOfflineBytes: offlineSpoolBytes,
      recommendedOfflineBytes: offlineSpoolBytes === null ? null : offlineSpoolBytes * HEADROOM_FACTOR
    },
    queryPerformance: input.queryPerformance,
    devices: deviceRows.sort((left, right) => right.projectedDailyBytes - left.projectedDailyBytes || left.name.localeCompare(right.name))
  };
}

type CapacityReport = ReturnType<typeof buildCapacityReport>;

export function buildPlatformCapacityReport(input: {
  tenants: Array<{
    id: string;
    name: string;
    active: boolean;
    report: CapacityReport;
  }>;
}) {
  const reports = input.tenants.map((tenant) => tenant.report);
  const firstReceivedValues = reports
    .map((report) => report.storage.firstReceivedAt)
    .filter((value): value is string => Boolean(value));
  const lastReceivedValues = reports
    .map((report) => report.storage.lastReceivedAt)
    .filter((value): value is string => Boolean(value));
  const firstReceivedAt = firstReceivedValues.length
    ? firstReceivedValues.reduce((earliest, value) => Date.parse(value) < Date.parse(earliest) ? value : earliest)
    : null;
  const lastReceivedAt = lastReceivedValues.length
    ? lastReceivedValues.reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest)
    : null;
  const firstMs = firstReceivedAt ? Date.parse(firstReceivedAt) : Number.NaN;
  const lastMs = lastReceivedAt ? Date.parse(lastReceivedAt) : Number.NaN;
  const coverageDays = Number.isFinite(firstMs) && Number.isFinite(lastMs)
    ? Math.max(0, (lastMs - firstMs) / 86_400_000)
    : null;
  const querySamples = reports.reduce((sum, report) => sum + report.queryPerformance.samples24h, 0);
  const weightedQueryTotal = reports.reduce((sum, report) => sum
    + (report.queryPerformance.averageMs ?? 0) * report.queryPerformance.samples24h, 0);
  const p95Values = reports.map((report) => report.queryPerformance.p95Ms)
    .filter((value): value is number => value !== null);
  const maximumValues = reports.map((report) => report.queryPerformance.maximumMs)
    .filter((value): value is number => value !== null);
  const spoolEstimates = reports.map((report) => report.spool.recommendedOfflineBytes)
    .filter((value): value is number => value !== null);
  const instancePhysicalBytes = reports.reduce(
    (maximum, report) => Math.max(maximum, report.storage.instancePhysicalBytes), 0
  );

  return {
    generatedAt: new Date().toISOString(),
    scope: 'platform' as const,
    basis: reports[0]?.basis ?? {
      retentionMonths: RETENTION_MONTHS,
      estimatedRetentionDays: ESTIMATED_RETENTION_DAYS,
      offlineHours: 6,
      headroomPercent: Math.round((HEADROOM_FACTOR - 1) * 100),
      projectionWindow: 'highest_rate_5m_1h_24h'
    },
    overview: {
      configuredDevices: reports.reduce((sum, report) => sum + report.overview.configuredDevices, 0),
      enabledDevices: reports.reduce((sum, report) => sum + report.overview.enabledDevices, 0),
      customerTenants: input.tenants.length,
      activeTenants: input.tenants.filter((tenant) => tenant.active).length,
      rawRecords24h: reports.reduce((sum, report) => sum + report.overview.rawRecords24h, 0),
      events24h: reports.reduce((sum, report) => sum + report.overview.events24h, 0),
      rawRecordsPerSecond5m: reports.reduce((sum, report) => sum + report.overview.rawRecordsPerSecond5m, 0),
      eventsPerSecond5m: reports.reduce((sum, report) => sum + report.overview.eventsPerSecond5m, 0),
      peakRawRecordsPerSecond24h: reports.reduce((sum, report) => sum + report.overview.peakRawRecordsPerSecond24h, 0),
      peakEventsPerSecond24h: reports.reduce((sum, report) => sum + report.overview.peakEventsPerSecond24h, 0)
    },
    storage: {
      instancePhysicalBytes,
      tenantEstimatedCurrentBytes: instancePhysicalBytes,
      projectedDailyBytes: reports.reduce((sum, report) => sum + report.storage.projectedDailyBytes, 0),
      projectedRetentionBytes: reports.reduce((sum, report) => sum + report.storage.projectedRetentionBytes, 0),
      recommendedRetentionBytes: reports.reduce((sum, report) => sum + report.storage.recommendedRetentionBytes, 0),
      firstReceivedAt,
      lastReceivedAt,
      coverageDays
    },
    spool: {
      collectorsMeasured: reports.reduce((sum, report) => sum + report.spool.collectorsMeasured, 0),
      pendingRecords: reports.reduce((sum, report) => sum + report.spool.pendingRecords, 0),
      pendingEvents: reports.reduce((sum, report) => sum + report.spool.pendingEvents, 0),
      recommendedOfflineBytes: spoolEstimates.length
        ? spoolEstimates.reduce((sum, value) => sum + value, 0)
        : null
    },
    queryPerformance: {
      samples24h: querySamples,
      averageMs: querySamples > 0 ? weightedQueryTotal / querySamples : null,
      p95Ms: p95Values.length ? Math.max(...p95Values) : null,
      maximumMs: maximumValues.length ? Math.max(...maximumValues) : null
    },
    tenants: input.tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      active: tenant.active,
      configuredDevices: tenant.report.overview.configuredDevices,
      enabledDevices: tenant.report.overview.enabledDevices,
      rawRecords24h: tenant.report.overview.rawRecords24h,
      events24h: tenant.report.overview.events24h,
      eventsPerSecond5m: tenant.report.overview.eventsPerSecond5m,
      estimatedCurrentBytes: tenant.report.storage.tenantEstimatedCurrentBytes,
      projectedDailyBytes: tenant.report.storage.projectedDailyBytes,
      recommendedRetentionBytes: tenant.report.storage.recommendedRetentionBytes,
      lastReceivedAt: tenant.report.storage.lastReceivedAt
    })).sort((left, right) => right.estimatedCurrentBytes - left.estimatedCurrentBytes || left.name.localeCompare(right.name))
  };
}

export function registerCapacityRoutes(app: FastifyInstance, dependencies: {
  postgres: PostgresRepository;
  clickhouse: ClickHouseRepository;
  offlineHours: number;
}): void {
  app.get('/v1/capacity', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (!['admin', 'auditor'].includes(session.role)) {
      return reply.code(403).send({ error: 'capacity_access_required' });
    }
    if (session.context === 'platform') {
      const tenants = await dependencies.postgres.listPlatformTenants();
      const reports = await Promise.all(tenants.map(async (tenant) => {
        const [snapshot, devices, collectors, queryPerformance] = await Promise.all([
          dependencies.clickhouse.getCapacitySnapshot(tenant.id),
          dependencies.postgres.listDevices(tenant.id),
          dependencies.postgres.listCollectors(tenant.id),
          dependencies.postgres.getQueryPerformance(tenant.id)
        ]);
        return {
          id: tenant.id,
          name: tenant.name,
          active: tenant.active,
          report: buildCapacityReport({
            snapshot, devices, collectors, queryPerformance, offlineHours: dependencies.offlineHours
          })
        };
      }));
      return reply.send(buildPlatformCapacityReport({ tenants: reports }));
    }
    const [snapshot, devices, collectors, queryPerformance] = await Promise.all([
      dependencies.clickhouse.getCapacitySnapshot(session.tenantId),
      dependencies.postgres.listDevices(session.tenantId),
      dependencies.postgres.listCollectors(session.tenantId),
      dependencies.postgres.getQueryPerformance(session.tenantId)
    ]);
    return reply.send(buildCapacityReport({ snapshot, devices, collectors, queryPerformance, offlineHours: dependencies.offlineHours }));
  });

  app.post('/v1/capacity/estimate', async (request, reply) => {
    const session = await authenticateRequest(request, reply, dependencies.postgres, { allowPlatformContext: true });
    if (!session) return;
    if (!session.platformAdmin) {
      return reply.code(403).send({ error: 'capacity_access_required' });
    }
    const parsed = storageEstimateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_capacity_estimate', details: parsed.error.flatten() });
    }
    return reply.send(buildStorageEstimate(parsed.data));
  });
}
