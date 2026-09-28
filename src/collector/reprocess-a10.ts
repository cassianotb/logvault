import { loadCollectorConfig } from '../config.js';
import type { RawRecord } from '../domain/models.js';
import { A10SyslogParser, a10SyslogReportedIp } from '../parsers/a10-syslog.js';
import { CollectorSpool } from './spool.js';

const config = loadCollectorConfig();
const spool = new CollectorSpool(config.ARGUS_SPOOL_PATH);

try {
  const devices = new Map((spool.loadDeviceRegistry() ?? []).map((device) => [device.exporterIp, device]));
  const result = spool.reprocessAcknowledged(
    new A10SyslogParser(),
    (raw) => {
      if (raw.vendor.toLowerCase() !== 'a10' || raw.sourceType !== 'syslog') return false;
      const payload = Buffer.from(raw.rawPayload, 'base64').toString('utf8');
      return (raw.parserVersion === 'a10-syslog/0.1.0' && payload.includes('LSN:PortBatchV2'))
        || (raw.parseStatus === 'unrecognized' && /LSN:PortBatchV2(?:Allocated|Freed):(?:OTHER|-)\s+\[/i.test(payload));
    },
    (raw, payload): RawRecord => {
      const reportedExporterIp = a10SyslogReportedIp(payload);
      const device = reportedExporterIp ? devices.get(reportedExporterIp) : undefined;
      return device ? {
        ...raw,
        deviceId: device.deviceId,
        vendor: device.vendor,
        exporterIp: device.exporterIp
      } : raw;
    }
  );
  console.log(JSON.stringify({ parserVersion: 'a10-syslog/0.4.0', ...result }));
} finally {
  spool.close();
}
