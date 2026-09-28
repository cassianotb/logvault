import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { batchChecksum } from '../dist/core/crypto.js';

const tenantId = process.env.ARGUS_TENANT_ID;
const collectorId = process.env.ARGUS_COLLECTOR_ID;
const deviceId = '00000000-0000-0000-0000-000000000001';
const token = process.env.ARGUS_SYNC_TOKEN;
const apiUrl = process.env.ARGUS_BENCHMARK_API_URL || 'http://api:8080';
const scenarioText = process.env.ARGUS_BENCHMARK_SCENARIOS || '20x250x2,30x500x4,50x1000x6';
const queryCount = Number(process.env.ARGUS_BENCHMARK_QUERIES || 50);

function positiveInteger(value, label, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > maximum) throw new Error(`${label} inválido`);
  return number;
}

function parseScenarios(value) {
  return value.split(',').map((scenario, index) => {
    const match = /^(\d+)x(\d+)x(\d+)$/.exec(scenario.trim());
    if (!match) throw new Error(`Cenário ${index + 1} deve usar lotesxregistrosxconcorrência`);
    return {
      batches: positiveInteger(match[1], 'Quantidade de lotes', 10_000),
      recordsPerBatch: positiveInteger(match[2], 'Registros por lote', 5_000),
      concurrency: positiveInteger(match[3], 'Concorrência', 64)
    };
  });
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}

function createBatch(sequenceBase, recordsPerBatch) {
  const batchId = randomUUID();
  const receivedAt = new Date().toISOString();
  const rawRecords = [];
  const events = [];
  for (let index = 0; index < recordsPerBatch; index += 1) {
    const sequence = sequenceBase + index;
    const rawId = randomUUID();
    const payload = Buffer.from(`benchmark-netflow-${sequence}`);
    const rawPayload = payload.toString('base64');
    rawRecords.push({
      rawId, batchId, tenantId, collectorId, deviceId, vendor: 'cisco', sourceType: 'netflow_v9',
      exporterIp: '192.0.2.10', exporterPort: 2055, localSequence: sequence, receivedAt, exporterTime: receivedAt,
      observationDomainId: 1, exportSequence: sequence, templateId: 256, payloadFormat: 'base64', rawPayload,
      rawSha256: createHash('sha256').update(payload).digest('hex'),
      decodedJson: JSON.stringify({ benchmark: true, sequence }), parseStatus: 'parsed', parserVersion: 'benchmark-1', parseError: ''
    });
    const portStart = 1024 + ((sequence * 512) % 63_488);
    events.push({
      eventId: randomUUID(), rawId, batchId, recordIndex: 0, tenantId, collectorId, deviceId, vendor: 'cisco',
      sourceType: 'netflow_v9', eventAt: receivedAt, receivedAt, publicIp: `203.0.113.${1 + (sequence % 200)}`,
      privateIp: `100.64.${Math.floor(sequence / 250) % 256}.${1 + (sequence % 250)}`, protocol: sequence % 2 ? 17 : 6,
      protocolName: sequence % 2 ? 'UDP' : 'TCP', portStart, portEnd: Math.min(65535, portStart + 511),
      portMode: 'contiguous', portStep: null, portCount: 512, eventType: 'allocated', eventTypeRaw: 'benchmark_allocated',
      vendorFields: { benchmark: 'true' }, parserVersion: 'benchmark-1'
    });
  }
  return {
    batchId, tenantId, collectorId, checksum: batchChecksum(rawRecords, events), createdAt: receivedAt, rawRecords, events
  };
}

async function postBatch(batch) {
  const startedAt = performance.now();
  const serialized = JSON.stringify(batch);
  const response = await fetch(`${apiUrl}/v1/ingest/batches`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: serialized
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status !== 'committed') throw new Error(`Lote recusado: HTTP ${response.status} ${JSON.stringify(payload)}`);
  return { durationMs: performance.now() - startedAt, bytes: Buffer.byteLength(serialized) };
}

async function runScenario(scenario, sequenceStart) {
  let nextBatch = 0;
  let failed = 0;
  let bytes = 0;
  const durations = [];
  const startedAt = performance.now();
  const workers = Array.from({ length: Math.min(scenario.concurrency, scenario.batches) }, async () => {
    while (true) {
      const batchIndex = nextBatch;
      nextBatch += 1;
      if (batchIndex >= scenario.batches) return;
      try {
        const batch = createBatch(sequenceStart + batchIndex * scenario.recordsPerBatch, scenario.recordsPerBatch);
        const result = await postBatch(batch);
        durations.push(result.durationMs);
        bytes += result.bytes;
      } catch (error) {
        failed += 1;
        console.error(error instanceof Error ? error.message : String(error));
      }
    }
  });
  await Promise.all(workers);
  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  const records = (scenario.batches - failed) * scenario.recordsPerBatch;
  return {
    ...scenario,
    records,
    failedBatches: failed,
    elapsedSeconds,
    recordsPerSecond: records / elapsedSeconds,
    megabitsPerSecond: bytes * 8 / elapsedSeconds / 1_000_000,
    requestLatencyMs: {
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      maximum: durations.length ? Math.max(...durations) : 0
    }
  };
}

async function login() {
  const response = await fetch(`${apiUrl}/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.ARGUS_BOOTSTRAP_ADMIN_EMAIL, password: process.env.ARGUS_BOOTSTRAP_ADMIN_PASSWORD })
  });
  if (!response.ok) throw new Error(`Login do benchmark falhou: HTTP ${response.status}`);
  return response.headers.get('set-cookie')?.split(';')[0] || '';
}

async function benchmarkQueries(cookie, count) {
  const durations = [];
  for (let index = 0; index < count; index += 1) {
    const query = new URLSearchParams({
      publicIp: `203.0.113.${1 + (index % 200)}`,
      at: new Date(Date.now() + 60_000).toISOString(),
      correlateErp: 'false'
    });
    const startedAt = performance.now();
    const response = await fetch(`${apiUrl}/v1/cgnat/search?${query}`, { headers: { cookie } });
    if (!response.ok) throw new Error(`Consulta do benchmark falhou: HTTP ${response.status}`);
    await response.arrayBuffer();
    durations.push(performance.now() - startedAt);
  }
  return {
    count,
    latencyMs: { p50: percentile(durations, 0.5), p95: percentile(durations, 0.95), maximum: Math.max(...durations) }
  };
}

async function storedCounts() {
  const query = 'SELECT (SELECT count() FROM argus.ingest_raw), (SELECT count() FROM argus.cgnat_events) FORMAT TSV';
  const credentials = Buffer.from(`${process.env.ARGUS_CLICKHOUSE_USER}:${process.env.ARGUS_CLICKHOUSE_PASSWORD}`).toString('base64');
  const response = await fetch(`${process.env.ARGUS_CLICKHOUSE_URL}/?query=${encodeURIComponent(query)}`, {
    headers: { authorization: `Basic ${credentials}` }
  });
  if (!response.ok) throw new Error(`Contagem ClickHouse falhou: HTTP ${response.status}`);
  const [raw, events] = (await response.text()).trim().split('\t').map(Number);
  return { raw, events };
}

const scenarios = parseScenarios(scenarioText);
positiveInteger(queryCount, 'Quantidade de consultas', 10_000);
let sequence = 0;
const results = [];
for (const scenario of scenarios) {
  const result = await runScenario(scenario, sequence);
  results.push(result);
  sequence += scenario.batches * scenario.recordsPerBatch;
  console.log(`Cenário ${scenario.batches}x${scenario.recordsPerBatch} c=${scenario.concurrency}: ${Math.round(result.recordsPerSecond)} registros/s, p95 ${Math.round(result.requestLatencyMs.p95)} ms`);
  if (result.failedBatches > 0) throw new Error(`${result.failedBatches} lote(s) falharam`);
}
const counts = await storedCounts();
if (counts.raw !== sequence || counts.events !== sequence) {
  throw new Error(`Contagem divergente: raw=${counts.raw}/${sequence}, eventos=${counts.events}/${sequence}`);
}
const queries = await benchmarkQueries(await login(), queryCount);
console.log(`Consultas: p95 ${Math.round(queries.latencyMs.p95)} ms em ${queries.count} amostras`);
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), totalRecords: sequence, storedCounts: counts, scenarios: results, queries }));
