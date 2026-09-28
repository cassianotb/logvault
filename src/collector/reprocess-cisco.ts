import { loadCollectorConfig } from '../config.js';
import { NetflowV9Parser } from '../parsers/netflow-v9.js';
import { CollectorSpool } from './spool.js';

const config = loadCollectorConfig();
const spool = new CollectorSpool(config.ARGUS_SPOOL_PATH);

try {
  const result = spool.reprocessAcknowledged(
    new NetflowV9Parser(spool),
    (raw) => raw.vendor.toLowerCase() === 'cisco'
      && raw.sourceType === 'netflow_v9'
      && raw.parserVersion === 'netflow-v9/0.1.0'
  );
  console.log(JSON.stringify({ parserVersion: 'netflow-v9/0.2.0', ...result }));
} finally {
  spool.close();
}
