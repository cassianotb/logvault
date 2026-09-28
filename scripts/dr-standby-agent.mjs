import { createServer } from 'node:http';

const port = Number(process.env.ARGUS_DR_AGENT_PORT ?? 8082);
const server = createServer((request, response) => {
  if (request.url === '/health/ready') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ready: true, role: 'standby', at: new Date().toISOString() }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not_found' }));
});
server.listen(port, '0.0.0.0');
