import { describe, expect, it } from 'vitest';
import type { CgnatSearchRow } from '../src/api/clickhouse.js';
import { buildCsv, buildPdf, reportHash } from '../src/api/report.js';

const rows: CgnatSearchRow[] = [{
  deviceId: '20000000-0000-4000-8000-000000000001',
  lastEventId: '30000000-0000-4000-8000-000000000001',
  publicIp: '198.51.100.14',
  privateIp: '100.65.170.202',
  protocol: 6,
  protocolName: 'TCP',
  portStart: 23040,
  portEnd: 23551,
  portMode: 'contiguous',
  portStep: null,
  lastEvent: 'allocated',
  lastEventAt: '2026-08-06T23:56:55.000Z',
  exactPortMatch: true
}];

const input = {
  publicIp: '198.51.100.14',
  searchedAt: '2026-08-06T23:57:00.000Z',
  searchedAtLocal: '2026-08-06T20:57:00',
  searchedTimezone: 'America/Sao_Paulo',
  port: 23040,
  protocol: 6,
  auditId: '10000000-0000-4000-8000-000000000001',
  rows
};

describe('relatórios de consulta', () => {
  it('gera CSV compatível com planilhas, com BOM e separador ponto e vírgula', () => {
    const report = buildCsv(input);
    const text = report.toString('utf8');

    expect(text.startsWith('\ufeff"IP Público";"IP Privado"')).toBe(true);
    expect(text).toContain('"198.51.100.14";"100.65.170.202";"TCP";"23040";"23551"');
    expect(text).toContain('allocated - 2026-08-06 23:56:55');
    expect(text).not.toContain('.000Z');
    expect(text.endsWith('\r\n')).toBe(true);
  });

  it('gera um PDF autocontido e identificável pela auditoria', () => {
    const report = buildPdf(input);
    const text = report.toString('latin1');

    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain(input.auditId);
    expect(text).toContain('198.51.100.14');
    expect(text).toContain('America/Sao_Paulo');
    expect(text).toContain('2026-08-06 23:57:00');
    expect(text).not.toContain('.000Z');
    expect(text.endsWith('%%EOF\n')).toBe(true);
    expect(reportHash(report)).toMatch(/^[a-f0-9]{64}$/);
  });
});
