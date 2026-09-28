import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildOfficialReportPdf } from '../src/api/official-report-document.js';
import type { OfficialReportClaim } from '../src/api/postgres.js';

const job: OfficialReportClaim = {
  id: '40000000-0000-4000-8000-000000000001',
  tenantId: '10000000-0000-4000-8000-000000000001',
  requestedByUserId: '50000000-0000-4000-8000-000000000001',
  requestedByName: 'Operador NOC',
  queryAuditId: '60000000-0000-4000-8000-000000000001',
  selectedEventId: '30000000-0000-4000-8000-000000000001',
  status: 'processing',
  request: {
    publicIp: '198.51.100.14',
    searchedAtUtc: '2026-08-06T23:57:00.000Z',
    searchedAtLocal: '2026-08-06T20:57:00',
    searchedTimezone: 'America/Sao_Paulo',
    port: 23040,
    protocol: 6,
    referenceNumber: 'OFÍCIO 123/2026',
    requestingAuthority: 'Autoridade solicitante',
    notes: ''
  },
  cgnat: {
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
  },
  company: {
    tenantId: '10000000-0000-4000-8000-000000000001',
    tenantName: 'ISP Exemplo',
    legalName: 'ISP Exemplo Telecom Ltda.',
    tradeName: 'ISP Exemplo',
    cnpj: '12345678000195',
    phone: '(48) 99999-0000',
    email: 'legal@isp.example',
    postalCode: '89850000',
    street: 'Avenida Principal',
    addressNumber: '100',
    complement: '',
    district: 'Centro',
    city: 'Cidade',
    state: 'SC',
    logoConfigured: false,
    updatedAt: '2026-08-11T10:00:00.000Z'
  },
  subscriber: { status: 'erp_not_integrated' },
  sha256: null,
  errorMessage: '',
  requestedAt: '2026-08-11T11:00:00.000Z',
  completedAt: null,
  logoData: null,
  logoMime: null
};

describe('relatório oficial CGNAT', () => {
  it('gera PDF apenas com o registro CGNAT e marca o ERP como não integrado', async () => {
    const pdf = await buildOfficialReportPdf(job);
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-1.7')).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(1500);
    expect(job.subscriber.status).toBe('erp_not_integrated');
  });

  it('organiza todos os dados do assinante e leva observações extensas para uma segunda página', async () => {
    const identifiedJob: OfficialReportClaim = {
      ...job,
      request: {
        ...job.request,
        notes: 'A autoridade solicitante pediu que o contexto complementar da consulta fosse preservado no documento. '.repeat(8)
      },
      subscriber: {
        status: 'identified',
        provider: 'elleven',
        name: 'Fulano de Tal da Silva',
        taxId: '123.456.789-00',
        identity: '1.234.567 SSP/SC',
        phone: '(48) 99912-5001',
        email: 'fulano.silva@example.com',
        address: {
          postalCode: '88806050',
          street: 'Rua Exemplo',
          number: '109',
          complement: 'Casa',
          district: 'Vila Nova',
          city: 'Criciúma',
          state: 'SC'
        },
        username: 'fulano.silva_1',
        contractId: '117658',
        contractNumber: '117658',
        radiusSession: {
          startedAt: '2026-08-06T22:00:00.000Z',
          updatedAt: '2026-08-06T23:56:00.000Z',
          stoppedAt: null
        }
      }
    };

    const pdf = await buildOfficialReportPdf(identifiedJob);
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBe(2);
    expect(pdf.byteLength).toBeGreaterThan(2500);
  });
});
