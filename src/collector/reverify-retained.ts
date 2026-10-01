import { loadCollectorConfig } from '../config.js';
import { CollectorSpool } from './spool.js';

const destinationId = process.argv[2]?.trim();
if (!destinationId || !/^[A-Za-z0-9._-]{1,100}$/.test(destinationId)) {
  console.error('Uso: node dist/collector/reverify-retained.js primary|secondary');
  process.exitCode = 2;
} else {
  const config = loadCollectorConfig();
  const spool = new CollectorSpool(config.ARGUS_SPOOL_PATH);
  try {
    console.log(JSON.stringify(spool.requeueAcknowledged(destinationId), null, 2));
  } finally {
    spool.close();
  }
}
