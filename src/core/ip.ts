export function ipv4FromBuffer(buffer: Buffer): string {
  if (buffer.length !== 4) throw new Error(`IPv4 requer 4 bytes; recebido ${buffer.length}`);
  return `${buffer[0]}.${buffer[1]}.${buffer[2]}.${buffer[3]}`;
}

export function protocolName(protocol: number): string {
  if (protocol === 6) return 'TCP';
  if (protocol === 17) return 'UDP';
  return String(protocol);
}

