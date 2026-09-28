import { deterministicId } from '../core/crypto.js';
import type { CgnatEvent, ParseContext, ParseResult } from '../domain/models.js';
import type { PacketParser } from './parser.js';

const PARSER_VERSION = 'netflow-v9/0.2.0';
const CISCO_BPA_FIELDS = [8, 225, 4, 230, 323, 361, 363, 364] as const;
const CISCO_EVENT_TYPES: Readonly<Record<number, CgnatEvent['eventType']>> = {
  1: 'allocated',
  2: 'deallocated'
};

export interface NetflowField {
  type: number;
  length: number;
}

export interface NetflowTemplate {
  exporterIp: string;
  observationDomainId: number;
  templateId: number;
  fields: NetflowField[];
  updatedAt: string;
}

export interface NetflowTemplateStore {
  get(exporterIp: string, observationDomainId: number, templateId: number): NetflowTemplate | undefined;
  put(template: NetflowTemplate): void;
}

interface DecodedRecordField extends NetflowField {
  valueHex: string;
}

interface DecodedRecord {
  templateId: number;
  fields: DecodedRecordField[];
}

function unsignedValue(field: DecodedRecordField): number | undefined {
  const bytes = Buffer.from(field.valueHex, 'hex');
  if (bytes.length !== field.length || bytes.length === 0 || bytes.length > 8) return undefined;
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : undefined;
}

function ipv4Value(field: DecodedRecordField): string | undefined {
  if (field.length !== 4) return undefined;
  const bytes = Buffer.from(field.valueHex, 'hex');
  return bytes.length === 4 ? [...bytes].join('.') : undefined;
}

function protocolName(protocol: number): string {
  if (protocol === 1) return 'ICMP';
  if (protocol === 6) return 'TCP';
  if (protocol === 17) return 'UDP';
  return `IP-${protocol}`;
}

export class NetflowV9Parser implements PacketParser {
  constructor(private readonly templates: NetflowTemplateStore) {}

  parse(payload: Buffer, context: ParseContext): ParseResult {
    try {
      if (payload.length < 20) throw new Error('Cabeçalho NetFlow v9 incompleto');
      const version = payload.readUInt16BE(0);
      if (version !== 9) throw new Error(`Versão NetFlow não suportada: ${version}`);

      const count = payload.readUInt16BE(2);
      const sysUptime = payload.readUInt32BE(4);
      const unixSeconds = payload.readUInt32BE(8);
      const sequence = payload.readUInt32BE(12);
      const observationDomainId = payload.readUInt32BE(16);
      const templateExporterKey = context.templateNamespace
        ? `${context.templateNamespace}:${context.exporterIp}`
        : context.exporterIp;
      const exporterTime = new Date(unixSeconds * 1000).toISOString();
      const decodedRecords: DecodedRecord[] = [];
      const templatesSeen: number[] = [];
      const missingTemplates: number[] = [];

      let offset = 20;
      while (offset + 4 <= payload.length) {
        const flowSetId = payload.readUInt16BE(offset);
        const flowSetLength = payload.readUInt16BE(offset + 2);
        if (flowSetLength < 4 || offset + flowSetLength > payload.length) {
          throw new Error(`FlowSet inválido em ${offset}: tamanho ${flowSetLength}`);
        }
        const end = offset + flowSetLength;

        if (flowSetId === 0) {
          this.decodeTemplates(payload, offset + 4, end, templateExporterKey, observationDomainId, context.receivedAt, templatesSeen);
        } else if (flowSetId >= 256) {
          const template = this.templates.get(templateExporterKey, observationDomainId, flowSetId);
          if (!template) missingTemplates.push(flowSetId);
          else decodedRecords.push(...this.decodeDataRecords(payload, offset + 4, end, template));
        }
        offset = end;
      }

      const status: ParseResult['status'] = missingTemplates.length
        ? 'missing_template'
        : decodedRecords.length || templatesSeen.length
          ? 'decoded_unmapped'
          : 'unrecognized';
      const normalized = this.normalizeCiscoBpa(decodedRecords, context, observationDomainId, sequence);

      return {
        status: normalized.events.length > 0 && missingTemplates.length === 0 ? 'parsed' : status,
        parserVersion: PARSER_VERSION,
        exporterTime,
        observationDomainId,
        exportSequence: sequence,
        templateId: decodedRecords.length === 1 ? decodedRecords[0]?.templateId ?? null : null,
        decoded: {
          header: { version, count, sysUptime, unixSeconds, sequence, observationDomainId },
          templatesSeen,
          missingTemplates,
          records: decodedRecords
        },
        events: normalized.events,
        error: [
          missingTemplates.length ? `Templates ausentes: ${missingTemplates.join(', ')}` : '',
          ...normalized.errors
        ].filter(Boolean).join('; ')
      };
    } catch (error) {
      return {
        status: 'error',
        parserVersion: PARSER_VERSION,
        exporterTime: null,
        observationDomainId: null,
        exportSequence: null,
        templateId: null,
        decoded: {},
        events: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private normalizeCiscoBpa(
    records: DecodedRecord[],
    context: ParseContext,
    observationDomainId: number,
    exportSequence: number
  ): { events: CgnatEvent[]; errors: string[] } {
    if (context.vendor.toLowerCase() !== 'cisco') return { events: [], errors: [] };
    const events: CgnatEvent[] = [];
    const errors: string[] = [];

    records.forEach((record, recordIndex) => {
      const fields = new Map(record.fields.map((field) => [field.type, field]));
      const hasBpaFields = fields.has(361) || fields.has(363) || fields.has(364);
      if (!hasBpaFields) return;
      const missing = CISCO_BPA_FIELDS.filter((type) => !fields.has(type));
      if (missing.length) {
        errors.push(`Registro ${recordIndex} do template ${record.templateId} sem IEs BPA: ${missing.join(', ')}`);
        return;
      }

      const privateIp = ipv4Value(fields.get(8)!);
      const publicIp = ipv4Value(fields.get(225)!);
      const protocol = unsignedValue(fields.get(4)!);
      const natEvent = unsignedValue(fields.get(230)!);
      const eventTimeMs = unsignedValue(fields.get(323)!);
      const portStart = unsignedValue(fields.get(361)!);
      const portStep = unsignedValue(fields.get(363)!);
      const portCount = unsignedValue(fields.get(364)!);
      const ingressVrfId = fields.has(234) ? unsignedValue(fields.get(234)!) : undefined;
      const eventType = natEvent === undefined ? undefined : CISCO_EVENT_TYPES[natEvent];

      if (!privateIp || !publicIp || protocol === undefined || !eventType || eventTimeMs === undefined) {
        errors.push(`Registro ${recordIndex} do template ${record.templateId} com endereço, protocolo, horário ou evento inválido`);
        return;
      }
      if (!portStart || !portStep || !portCount) {
        errors.push(`Registro ${recordIndex} do template ${record.templateId} com definição de portas não especificada`);
        return;
      }
      const portEnd = portStart + portStep * (portCount - 1);
      if (portEnd > 65535) {
        errors.push(`Registro ${recordIndex} do template ${record.templateId} excede a porta 65535`);
        return;
      }
      const eventAt = new Date(eventTimeMs);
      if (Number.isNaN(eventAt.getTime())) {
        errors.push(`Registro ${recordIndex} do template ${record.templateId} com timestamp inválido`);
        return;
      }

      events.push({
        eventId: deterministicId('cisco-bpa', context.rawId, recordIndex, PARSER_VERSION),
        rawId: context.rawId,
        batchId: null,
        recordIndex,
        tenantId: context.tenantId,
        collectorId: context.collectorId,
        deviceId: context.deviceId,
        vendor: context.vendor,
        sourceType: 'netflow_v9',
        eventAt: eventAt.toISOString(),
        receivedAt: context.receivedAt,
        publicIp,
        privateIp,
        protocol,
        protocolName: protocolName(protocol),
        portStart,
        portEnd,
        portMode: portStep === 1 ? 'contiguous' : 'strided',
        portStep,
        portCount,
        eventType,
        eventTypeRaw: String(natEvent),
        vendorFields: {
          templateId: String(record.templateId),
          observationDomainId: String(observationDomainId),
          exportSequence: String(exportSequence),
          ingressVrfId: String(ingressVrfId ?? ''),
          natEvent: String(natEvent),
          portRangeStepSize: String(portStep),
          portRangeNumPorts: String(portCount)
        },
        parserVersion: PARSER_VERSION
      });
    });

    return { events, errors };
  }

  private decodeTemplates(
    payload: Buffer,
    start: number,
    end: number,
    exporterIp: string,
    observationDomainId: number,
    updatedAt: string,
    templatesSeen: number[]
  ): void {
    let offset = start;
    while (offset + 4 <= end) {
      const templateId = payload.readUInt16BE(offset);
      const fieldCount = payload.readUInt16BE(offset + 2);
      if (templateId === 0 && fieldCount === 0) break;
      if (templateId < 256 || fieldCount === 0 || fieldCount > 1024) {
        throw new Error(`Template NetFlow inválido: id=${templateId}, campos=${fieldCount}`);
      }
      offset += 4;
      if (offset + fieldCount * 4 > end) throw new Error(`Template ${templateId} truncado`);
      const fields: NetflowField[] = [];
      for (let index = 0; index < fieldCount; index += 1) {
        fields.push({ type: payload.readUInt16BE(offset), length: payload.readUInt16BE(offset + 2) });
        offset += 4;
      }
      this.templates.put({ exporterIp, observationDomainId, templateId, fields, updatedAt });
      templatesSeen.push(templateId);
    }
  }

  private decodeDataRecords(payload: Buffer, start: number, end: number, template: NetflowTemplate): DecodedRecord[] {
    const recordLength = template.fields.reduce((sum, field) => sum + field.length, 0);
    if (recordLength <= 0) throw new Error(`Template ${template.templateId} possui registro vazio`);
    const records: DecodedRecord[] = [];
    let offset = start;
    while (offset + recordLength <= end) {
      const fields: DecodedRecordField[] = [];
      for (const field of template.fields) {
        fields.push({ ...field, valueHex: payload.subarray(offset, offset + field.length).toString('hex') });
        offset += field.length;
      }
      records.push({ templateId: template.templateId, fields });
    }
    return records;
  }
}
