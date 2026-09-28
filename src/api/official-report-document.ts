import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { OfficialReportClaim } from './postgres.js';

const dark = rgb(0.05, 0.11, 0.2);
const muted = rgb(0.35, 0.4, 0.5);
const border = rgb(0.79, 0.83, 0.89);
const soft = rgb(0.95, 0.97, 0.99);
const headerAccent = rgb(0.02, 0.43, 0.37);
const headerMark = rgb(0.08, 0.2, 0.34);

function formatCnpj(value: string): string {
  return /^\d{14}$/.test(value)
    ? value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : value || 'Não informado';
}

function protocolLabel(protocol: number, name: string): string {
  return name || ({ 1: 'ICMP', 6: 'TCP', 17: 'UDP' } as Record<number, string>)[protocol] || String(protocol);
}

function eventLabel(value: string): string {
  return ({ allocated: 'Alocação', deallocated: 'Desalocação' } as Record<string, string>)[value] || value;
}

function localMoment(value: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short', timeStyle: 'medium', timeZone: timezone
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function reportMoment(value: string, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: timezone
    }).formatToParts(new Date(value));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
    return `${part('day')}/${part('month')}/${part('year')} às ${part('hour')}:${part('minute')}:${part('second')} (${timezone})`;
  } catch {
    return value;
  }
}

function formatPostalCode(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : value;
}

function fitSingleLine(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  const suffix = '...';
  let result = text;
  while (result.length && font.widthOfTextAtSize(`${result}${suffix}`, size) > width) result = result.slice(0, -1);
  return `${result.trimEnd()}${suffix}`;
}

function companyInitials(value: string): string {
  const ignored = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E', 'LTDA', 'SA']);
  const words = value.toUpperCase().replace(/[^A-ZÀ-Ü0-9 ]/g, ' ').split(/\s+/)
    .filter((word) => word && !ignored.has(word));
  return (words.slice(0, 2).map((word) => word[0]).join('') || 'IP').slice(0, 2);
}

function drawRightText(page: PDFPage, font: PDFFont, text: string, options: {
  right: number; y: number; size: number; color: ReturnType<typeof rgb>; maxWidth: number; minSize?: number;
}): void {
  let size = options.size;
  const minSize = options.minSize ?? options.size;
  while (size > minSize && font.widthOfTextAtSize(text, size) > options.maxWidth) size -= 0.2;
  const fitted = fitSingleLine(text, font, size, options.maxWidth);
  page.drawText(fitted, {
    x: options.right - font.widthOfTextAtSize(fitted, size), y: options.y, size, font, color: options.color
  });
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

interface ReportTableRow {
  label: string;
  value: string;
  detail?: string;
  regularValue?: boolean;
}

function drawNumberedSectionTitle(page: PDFPage, bold: PDFFont, number: number, title: string, y: number): number {
  page.drawCircle({ x: 52, y: y + 1, size: 9.5, color: headerMark });
  const numberText = String(number);
  page.drawText(numberText, {
    x: 52 - bold.widthOfTextAtSize(numberText, 7.5) / 2,
    y: y - 1.8,
    size: 7.5,
    font: bold,
    color: rgb(1, 1, 1)
  });
  page.drawText(title.toUpperCase(), { x: 70, y: y - 3, size: 10.5, font: bold, color: headerMark });
  page.drawLine({ start: { x: 42, y: y - 13 }, end: { x: 553, y: y - 13 }, thickness: 0.8, color: border });
  return y - 25;
}

function drawReportTable(page: PDFPage, regular: PDFFont, bold: PDFFont, rows: ReportTableRow[], y: number): number {
  const x = 42;
  const width = 511;
  const labelWidth = 160;
  const valueX = x + labelWidth + 9;
  const valueWidth = width - labelWidth - 18;
  let cursor = y;

  page.drawLine({ start: { x, y: cursor }, end: { x: x + width, y: cursor }, thickness: 0.65, color: border });
  for (const row of rows) {
    const valueFont = row.regularValue ? regular : bold;
    const valueLines = wrap(row.value || 'Não informado', valueFont, 8.5, valueWidth);
    const detailLines = row.detail ? wrap(row.detail, regular, 6.7, valueWidth) : [];
    const contentHeight = valueLines.length * 9.5 + (detailLines.length ? 3 + detailLines.length * 8 : 0);
    const rowHeight = Math.max(22, 7 + contentHeight);
    const bottom = cursor - rowHeight;
    page.drawRectangle({ x, y: bottom, width: labelWidth, height: rowHeight, color: soft });
    page.drawLine({ start: { x: x + labelWidth, y: cursor }, end: { x: x + labelWidth, y: bottom }, thickness: 0.45, color: border });
    page.drawText(row.label.toUpperCase(), { x: x + 8, y: cursor - 14, size: 6.4, font: bold, color: muted });
    valueLines.forEach((line, index) => page.drawText(line, {
      x: valueX, y: cursor - 13 - index * 9.5, size: 8.5, font: valueFont, color: dark
    }));
    detailLines.forEach((line, index) => page.drawText(line, {
      x: valueX,
      y: cursor - 13 - valueLines.length * 9.5 - 1 - index * 8,
      size: 6.7,
      font: regular,
      color: muted
    }));
    page.drawLine({ start: { x, y: bottom }, end: { x: x + width, y: bottom }, thickness: 0.45, color: border });
    cursor = bottom;
  }
  return cursor;
}

function formatLocalInputMoment(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}:${match[6] ?? '00'}` : value.replace('T', ' ');
}

function formatMomentInTimezone(value: string, timezone: string): string {
  try {
    const formatted = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: timezone
    }).format(new Date(value));
    return formatted.replace(',', '');
  } catch {
    return value;
  }
}

function formatUtcMoment(value: string): string {
  return `${formatMomentInTimezone(value, 'UTC')} UTC`;
}

function timezoneOffset(value: string, timezone: string): string {
  try {
    const name = new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone, timeZoneName: 'longOffset'
    }).formatToParts(new Date(value)).find((part) => part.type === 'timeZoneName')?.value;
    return (name || 'UTC').replace('GMT', 'UTC');
  } catch {
    return 'UTC';
  }
}

export async function buildOfficialReportPdf(job: OfficialReportClaim): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.setTitle('Relatório de Log CGNAT para Atendimento de Ofício');
  document.setAuthor(job.company.legalName || job.company.tenantName || 'LogVault');
  document.setSubject(`Consulta CGNAT ${job.request.publicIp}`);
  document.setCreator('LogVault · Log Intelligence');
  let page = document.addPage([595.28, 841.89]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const companyName = job.company.legalName || job.company.tenantName;
  const markX = 42;
  const markY = 753;
  const markWidth = 52;
  const markHeight = 52;

  if (job.logoData && job.logoMime) {
    const image = job.logoMime === 'image/png'
      ? await document.embedPng(job.logoData)
      : await document.embedJpg(job.logoData);
    const dimensions = image.scale(Math.min(1, markWidth / image.width, markHeight / image.height));
    page.drawImage(image, {
      x: markX + (markWidth - dimensions.width) / 2,
      y: markY + (markHeight - dimensions.height) / 2,
      width: dimensions.width,
      height: dimensions.height
    });
  } else {
    page.drawRectangle({ x: markX, y: markY, width: markWidth, height: markHeight, color: headerMark });
    const initials = companyInitials(companyName);
    const initialsSize = 15;
    page.drawText(initials, {
      x: markX + (markWidth - bold.widthOfTextAtSize(initials, initialsSize)) / 2,
      y: markY + 18,
      size: initialsSize,
      font: bold,
      color: rgb(1, 1, 1)
    });
  }

  const companyX = 106;
  const companyWidth = 262;
  page.drawText(fitSingleLine(companyName.toUpperCase(), bold, 10.5, companyWidth), {
    x: companyX, y: 796, size: 10.5, font: bold, color: dark
  });
  page.drawText(`CNPJ ${formatCnpj(job.company.cnpj)}`, { x: companyX, y: 782, size: 7.2, font: regular, color: muted });
  const addressParts = [
    [job.company.street, job.company.addressNumber].filter(Boolean).join(', '),
    job.company.complement,
    job.company.district,
    [job.company.city, job.company.state].filter(Boolean).join('/'),
    job.company.postalCode ? `CEP ${formatPostalCode(job.company.postalCode)}` : ''
  ].filter(Boolean);
  page.drawText(fitSingleLine(addressParts.join(' — ') || 'Endereço não informado', regular, 6.8, companyWidth), {
    x: companyX, y: 770, size: 6.8, font: regular, color: muted
  });
  page.drawText(fitSingleLine(`${job.company.phone || 'Telefone não informado'} · ${job.company.email || 'E-mail não informado'}`, regular, 6.8, companyWidth), {
    x: companyX, y: 758, size: 6.8, font: regular, color: muted
  });

  const reportRight = 553;
  const reportWidth = 174;
  drawRightText(page, bold, 'RELATÓRIO DE LOG CGNAT', {
    right: reportRight, y: 796, size: 7.7, color: headerAccent, maxWidth: reportWidth
  });
  drawRightText(page, regular, 'Documento para atendimento de ofício', {
    right: reportRight, y: 782, size: 6.8, color: muted, maxWidth: reportWidth, minSize: 6.2
  });
  drawRightText(page, regular, `Relatório ${job.id}`, {
    right: reportRight, y: 770, size: 6.6, color: muted, maxWidth: reportWidth, minSize: 5.7
  });
  drawRightText(page, regular, `Emitido em ${reportMoment(job.requestedAt, job.request.searchedTimezone)}`, {
    right: reportRight, y: 758, size: 6.2, color: muted, maxWidth: reportWidth, minSize: 5.1
  });
  page.drawLine({ start: { x: 42, y: 737 }, end: { x: 553, y: 737 }, thickness: 0.8, color: border });

  let y = drawNumberedSectionTitle(page, bold, 1, 'Identificação da solicitação', 711);
  const requestRows: ReportTableRow[] = [];
  if (job.request.referenceNumber) requestRows.push({ label: 'Ofício / processo', value: job.request.referenceNumber });
  if (job.request.requestingAuthority) requestRows.push({ label: 'Órgão solicitante', value: job.request.requestingAuthority });
  requestRows.push(
    { label: 'IP público consultado', value: job.request.publicIp },
    {
      label: 'Data e horário informado',
      value: formatLocalInputMoment(job.request.searchedAtLocal),
      detail: `Fuso de referência: ${job.request.searchedTimezone} (${timezoneOffset(job.request.searchedAtUtc, job.request.searchedTimezone)})`
    },
    { label: 'Horário convertido (UTC)', value: formatUtcMoment(job.request.searchedAtUtc) },
    { label: 'Porta de origem', value: job.request.port === null ? 'Não informada' : String(job.request.port) },
    { label: 'Protocolo', value: job.request.protocol === null ? 'Todos' : protocolLabel(job.request.protocol, '') }
  );
  y = drawReportTable(page, regular, bold, requestRows, y) - 26;

  y = drawNumberedSectionTitle(page, bold, 2, 'Registro CGNAT identificado', y);
  y = drawReportTable(page, regular, bold, [
    { label: 'IP público (externo)', value: job.cgnat.publicIp },
    { label: 'IP privado (interno)', value: job.cgnat.privateIp },
    { label: 'Protocolo', value: protocolLabel(job.cgnat.protocol, job.cgnat.protocolName) },
    { label: 'Faixa de portas alocada', value: `${job.cgnat.portStart} – ${job.cgnat.portEnd}` },
    { label: 'Último evento explícito', value: eventLabel(job.cgnat.lastEvent), regularValue: true },
    {
      label: 'Data e horário do evento',
      value: formatMomentInTimezone(job.cgnat.lastEventAt, job.request.searchedTimezone),
      detail: `Equivalente a ${formatUtcMoment(job.cgnat.lastEventAt)}`
    }
  ], y) - 26;

  y = drawNumberedSectionTitle(page, bold, 3, 'Identificação do assinante', y);
  if (job.subscriber.status === 'identified') {
    const address = [
      [job.subscriber.address.street, job.subscriber.address.number].filter(Boolean).join(', '),
      job.subscriber.address.complement,
      job.subscriber.address.district,
      [job.subscriber.address.city, job.subscriber.address.state].filter(Boolean).join('/'),
      job.subscriber.address.postalCode ? `CEP ${formatPostalCode(job.subscriber.address.postalCode)}` : ''
    ].filter(Boolean).join(' — ');
    y = drawReportTable(page, regular, bold, [
      { label: 'Nome / razão social', value: job.subscriber.name, regularValue: true },
      { label: 'CPF / CNPJ', value: job.subscriber.taxId },
      { label: 'RG / identidade', value: job.subscriber.identity },
      { label: 'Usuário RADIUS', value: job.subscriber.username },
      { label: 'Contrato', value: job.subscriber.contractNumber || job.subscriber.contractId },
      { label: 'Telefone', value: job.subscriber.phone },
      { label: 'E-mail', value: job.subscriber.email },
      { label: 'Endereço de instalação', value: address || 'Não informado', regularValue: true }
    ], y) - 24;
  } else {
    const statusCopy: [string, string] = job.subscriber.status === 'ambiguous'
      ? ['Correlação ambígua', 'Mais de uma sessão RADIUS utilizava o IP privado no horário consultado; o LogVault não atribuiu um assinante.']
      : job.subscriber.status === 'not_found'
        ? ['Assinante não localizado', 'A integração foi consultada, mas não encontrou uma sessão RADIUS e um cadastro Voalle correspondentes.']
        : job.subscriber.status === 'integration_unavailable'
          ? ['Integração temporariamente indisponível', 'O assinante não pôde ser consultado no momento da geração deste documento.']
          : ['ERP ainda não integrado', 'O assinante não foi identificado. Este relatório contém exclusivamente os dados do registro CGNAT.'];
    y = drawReportTable(page, regular, bold, [
      { label: 'Situação', value: statusCopy[0] },
      { label: 'Detalhes', value: statusCopy[1], regularValue: true }
    ], y) - 24;
  }

  if (job.request.notes) {
    if (y < 150) {
      page = document.addPage([595.28, 841.89]);
      page.drawText(fitSingleLine(companyName.toUpperCase(), bold, 9, 330), {
        x: 42, y: 806, size: 9, font: bold, color: dark
      });
      drawRightText(page, bold, 'RELATÓRIO DE LOG CGNAT', {
        right: 553, y: 806, size: 7.5, color: headerAccent, maxWidth: 180
      });
      page.drawLine({ start: { x: 42, y: 793 }, end: { x: 553, y: 793 }, thickness: 0.8, color: border });
      y = 766;
    }
    y = drawNumberedSectionTitle(page, bold, 4, 'Observações', y);
    y = drawReportTable(page, regular, bold, [
      { label: 'Observações', value: job.request.notes, regularValue: true }
    ], y) - 12;
  }

  const pages = document.getPages();
  pages.forEach((reportPage, index) => {
    reportPage.drawLine({ start: { x: 42, y: 72 }, end: { x: 553, y: 72 }, thickness: 0.7, color: border });
    reportPage.drawText(`Consulta auditada: ${job.queryAuditId}`, { x: 42, y: 55, size: 7, font: regular, color: muted });
    reportPage.drawText(`Evento: ${job.selectedEventId}`, { x: 42, y: 43, size: 7, font: regular, color: muted });
    reportPage.drawText(`Solicitado por ${job.requestedByName} em ${localMoment(job.requestedAt, job.request.searchedTimezone)}`, {
      x: 42, y: 31, size: 7, font: regular, color: muted
    });
    const pageLabel = `Página ${index + 1} de ${pages.length}`;
    reportPage.drawText(pageLabel, {
      x: 553 - regular.widthOfTextAtSize(pageLabel, 7), y: 43, size: 7, font: regular, color: muted
    });
    const generatedBy = 'Gerado pelo LogVault · Log Intelligence';
    reportPage.drawText(generatedBy, {
      x: 553 - regular.widthOfTextAtSize(generatedBy, 7), y: 31, size: 7, font: regular, color: muted
    });
  });

  return Buffer.from(await document.save());
}
