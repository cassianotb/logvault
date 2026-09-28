import net from 'node:net';
import http from 'node:http';

const proxies = [
  { listen: 5432, host: 'postgres-b', port: 5432 },
  { listen: 8123, host: 'clickhouse-b', port: 8123 }
];

for (const proxy of proxies) {
  const server = net.createServer((client) => {
    const upstream = net.connect(proxy.port, proxy.host);
    client.pipe(upstream);
    upstream.pipe(client);
    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('error', close);
    upstream.on('error', close);
  });
  server.listen(proxy.listen, '0.0.0.0');
}

http.createServer((request, response) => {
  if (request.url === '/health/ready') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"status":"ready","mode":"dc-b-simulation"}');
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end('{"error":"not_found"}');
}).listen(8080, '0.0.0.0');

