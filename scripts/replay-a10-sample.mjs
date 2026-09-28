import dgram from 'node:dgram';

const host = process.argv[2] || '127.0.0.1';
const port = Number(process.argv[3] || 5140);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Porta UDP inválida');
}

const message = Buffer.from(
  '<134>1 2026-08-06T20:56:55-03:00 A10-CGN-EXEMPLO - - - LSN:PortBatchV2Freed:TCP [100.65.170.202 198.51.100.14 23040 23551]'
);
const socket = dgram.createSocket('udp4');

socket.send(message, port, host, (error) => {
  socket.close();
  if (error) throw error;
  console.log(JSON.stringify({ sent: true, host, port, bytes: message.length, event: 'Freed' }));
});
