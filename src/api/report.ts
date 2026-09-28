import { sha256 } from '../core/crypto.js';
import { formatUtcForReport } from '../core/timezone.js';
import type { CgnatSearchRow } from './clickhouse.js';

const headers = ['IP Público', 'IP Privado', 'Protocolo', 'Porta Início', 'Porta Fim', 'Último Evento', 'Assinante ERP'];

export interface ReportInput {
  publicIp: string;
  searchedAt: string;
  searchedAtLocal: string;
  searchedTimezone: string;
  port: number | null;
  protocol: number | null;
  auditId: string;
  rows: CgnatSearchRow[];
}

function reportRows(input: ReportInput): string[][] {
  return input.rows.map((row) => [
    row.publicIp,
    row.privateIp,
    row.protocolName,
    String(row.portStart),
    String(row.portEnd),
    `${row.lastEvent} - ${formatUtcForReport(row.lastEventAt)}`,
    'ERP não configurado'
  ]);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildCsv(input: ReportInput): Buffer {
  const lines = [headers, ...reportRows(input)].map((row) => row.map(csvCell).join(';'));
  return Buffer.from(`\ufeff${lines.join('\r\n')}\r\n`, 'utf8');
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function clip(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, Math.max(0, length - 3))}...`;
}

function contentStream(input: ReportInput, pageRows: string[][], page: number, totalPages: number): string {
  const widths = [16, 16, 9, 10, 10, 29, 27];
  const x = [34, 132, 230, 286, 354, 422, 602];
  const commands: string[] = [
    'BT',
    '/F1 15 Tf',
    `34 558 Td (${pdfEscape('Consulta CGNAT')}) Tj`,
    '/F1 8 Tf',
    `0 -18 Td (${pdfEscape(`IP: ${input.publicIp}   Horário informado: ${input.searchedAtLocal} (${input.searchedTimezone})`)}) Tj`,
    `0 -13 Td (${pdfEscape(`Horário UTC: ${formatUtcForReport(input.searchedAt)}   Porta: ${input.port ?? 'não informada'}   Protocolo: ${input.protocol ?? 'todos'}`)}) Tj`,
    `0 -13 Td (${pdfEscape(`Auditoria: ${input.auditId}   Página ${page}/${totalPages}`)}) Tj`,
    'ET',
    '0.86 0.89 0.91 RG',
    '34 497 m 808 497 l S',
    'BT',
    '/F1 7 Tf'
  ];

  headers.forEach((header, index) => commands.push(`1 0 0 1 ${x[index]} 505 Tm (${pdfEscape(header)}) Tj`));
  let y = 481;
  for (const row of pageRows) {
    row.forEach((value, index) => commands.push(`1 0 0 1 ${x[index]} ${y} Tm (${pdfEscape(clip(value, widths[index] ?? 20))}) Tj`));
    y -= 17;
  }
  commands.push('ET');
  return commands.join('\n');
}

export function buildPdf(input: ReportInput): Buffer {
  const rows = reportRows(input);
  const rowsPerPage = 25;
  const pages = Array.from({ length: Math.max(1, Math.ceil(rows.length / rowsPerPage)) }, (_, index) =>
    rows.slice(index * rowsPerPage, (index + 1) * rowsPerPage)
  );
  const objects: string[] = [];
  const pageObjectIds = pages.map((_, index) => 3 + index * 2);
  const fontObjectId = 3 + pages.length * 2;
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;

  pages.forEach((pageRows, index) => {
    const pageId = pageObjectIds[index]!;
    const contentId = pageId + 1;
    const stream = contentStream(input, pageRows, index + 1, pages.length);
    const streamLength = Buffer.byteLength(stream, 'latin1');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`;
  });
  objects[fontObjectId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

  let document = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(document, 'latin1');
    document += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document, 'latin1');
  document += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    document += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(document, 'latin1');
}

export function reportHash(report: Buffer): string {
  return sha256(report);
}
