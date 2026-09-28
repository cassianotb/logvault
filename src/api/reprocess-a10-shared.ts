import { loadApiConfig } from '../config.js';
import { newId } from '../core/crypto.js';
import type { CgnatEvent, RawRecord } from '../domain/models.js';
import { A10SyslogParser } from '../parsers/a10-syslog.js';
import { ClickHouseRepository } from './clickhouse.js';

const config = loadApiConfig();
const repository = new ClickHouseRepository({
  url: config.ARGUS_CLICKHOUSE_URL,
  username: config.ARGUS_CLICKHOUSE_USER,
  password: config.ARGUS_CLICKHOUSE_PASSWORD,
  database: config.ARGUS_CLICKHOUSE_DATABASE
});
const parser = new A10SyslogParser();
let reprocessedRecords = 0;
let generatedEvents = 0;

try {
  while (true) {
    const records = await repository.listUnrecognizedA10SharedProtocolRecords(1000);
    if (!records.length) break;
    const updatedRecords: RawRecord[] = [];
    const events: CgnatEvent[] = [];
    for (const raw of records) {
      const payload = Buffer.from(raw.rawPayload, 'base64');
      const parsed = parser.parse(payload, {
        rawId: raw.rawId,
        tenantId: raw.tenantId,
        collectorId: raw.collectorId,
        deviceId: raw.deviceId,
        vendor: raw.vendor,
        exporterIp: raw.exporterIp,
        exporterPort: raw.exporterPort,
        transportIp: raw.exporterIp,
        receivedAt: raw.receivedAt
      });
      if (parsed.status !== 'parsed' || parsed.events.length !== 2) {
        throw new Error(`O registro ${raw.rawId} não produziu os dois protocolos compartilhados esperados`);
      }
      updatedRecords.push({
        ...raw,
        exporterTime: parsed.exporterTime,
        observationDomainId: parsed.observationDomainId,
        exportSequence: parsed.exportSequence,
        templateId: parsed.templateId,
        decodedJson: JSON.stringify(parsed.decoded),
        parseStatus: parsed.status,
        parserVersion: parsed.parserVersion,
        parseError: parsed.error
      });
      events.push(...parsed.events.map((event) => ({ ...event, batchId: raw.batchId })));
    }
    await repository.replaceReprocessedRecords(newId(), updatedRecords, events);
    reprocessedRecords += updatedRecords.length;
    generatedEvents += events.length;
    console.log(JSON.stringify({ progress: true, reprocessedRecords, generatedEvents }));
  }
  console.log(JSON.stringify({ completed: true, parserVersion: 'a10-syslog/0.4.0', reprocessedRecords, generatedEvents }));
} finally {
  await repository.close();
}
