import { describe, expect, it } from 'vitest';
import { ipv4MatchesCidr, isPrivateIpv4, normalizeIpv4Cidr } from '../src/core/ipv4-cidr.js';

describe('política IPv4 do firewall de ingestão', () => {
  it('normaliza IPs individuais e redes', () => {
    expect(normalizeIpv4Cidr('203.0.113.10')).toBe('203.0.113.10/32');
    expect(normalizeIpv4Cidr('203.0.113.19/24')).toBe('203.0.113.0/24');
    expect(normalizeIpv4Cidr('203.0.113.10/33')).toBeNull();
    expect(normalizeIpv4Cidr('não-é-ip')).toBeNull();
  });

  it('compara o IP de transporte sem alterar o IP lógico do exportador', () => {
    expect(ipv4MatchesCidr('198.51.100.27', '198.51.100.0/24')).toBe(true);
    expect(ipv4MatchesCidr('198.51.101.27', '198.51.100.0/24')).toBe(false);
    expect(ipv4MatchesCidr('198.51.100.27', '198.51.100.27/32')).toBe(true);
  });

  it('identifica origens privadas e CGNAT para sinalização na interface', () => {
    expect(isPrivateIpv4('10.0.0.1')).toBe(true);
    expect(isPrivateIpv4('100.64.10.1')).toBe(true);
    expect(isPrivateIpv4('203.0.113.10')).toBe(false);
  });
});
