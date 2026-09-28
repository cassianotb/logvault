import { isIPv4 } from 'node:net';

function ipv4ToNumber(address: string): number {
  return address.split('.').reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);
}

function numberToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

export function normalizeIpv4Cidr(value: string): string | null {
  const trimmed = value.trim();
  const [address, prefixText, ...extra] = trimmed.split('/');
  if (extra.length || !address || !isIPv4(address)) return null;
  const prefix = prefixText === undefined ? 32 : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return `${numberToIpv4(ipv4ToNumber(address) & mask)}/${prefix}`;
}

export function ipv4MatchesCidr(address: string, cidr: string): boolean {
  if (!isIPv4(address)) return false;
  const normalized = normalizeIpv4Cidr(cidr);
  if (!normalized) return false;
  const [network, prefixText] = normalized.split('/');
  const prefix = Number(prefixText);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(network!) & mask);
}

export function isPrivateIpv4(address: string): boolean {
  if (!isIPv4(address)) return false;
  const value = ipv4ToNumber(address);
  const inRange = (network: string, prefix: number) => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (ipv4ToNumber(network) & mask);
  };
  return inRange('10.0.0.0', 8)
    || inRange('100.64.0.0', 10)
    || inRange('127.0.0.0', 8)
    || inRange('169.254.0.0', 16)
    || inRange('172.16.0.0', 12)
    || inRange('192.168.0.0', 16);
}
