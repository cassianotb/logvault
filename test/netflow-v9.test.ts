import { describe, expect, it } from 'vitest';
import { NetflowV9Parser, type NetflowTemplate, type NetflowTemplateStore } from '../src/parsers/netflow-v9.js';

class MemoryTemplates implements NetflowTemplateStore {
  private readonly values = new Map<string, NetflowTemplate>();

  get(exporterIp: string, observationDomainId: number, templateId: number) {
    return this.values.get(`${exporterIp}:${observationDomainId}:${templateId}`);
  }

  put(template: NetflowTemplate): void {
    this.values.set(`${template.exporterIp}:${template.observationDomainId}:${template.templateId}`, template);
  }
}

function header(count: number, sequence: number): Buffer {
  const value = Buffer.alloc(20);
  value.writeUInt16BE(9, 0);
  value.writeUInt16BE(count, 2);
  value.writeUInt32BE(1000, 4);
  value.writeUInt32BE(1786050000, 8);
  value.writeUInt32BE(sequence, 12);
  value.writeUInt32BE(42, 16);
  return value;
}

function templatePacket(): Buffer {
  const flowSet = Buffer.alloc(16);
  flowSet.writeUInt16BE(0, 0);
  flowSet.writeUInt16BE(16, 2);
  flowSet.writeUInt16BE(256, 4);
  flowSet.writeUInt16BE(2, 6);
  flowSet.writeUInt16BE(8, 8);
  flowSet.writeUInt16BE(4, 10);
  flowSet.writeUInt16BE(4, 12);
  flowSet.writeUInt16BE(1, 14);
  return Buffer.concat([header(1, 10), flowSet]);
}

function dataPacket(): Buffer {
  const flowSet = Buffer.alloc(12);
  flowSet.writeUInt16BE(256, 0);
  flowSet.writeUInt16BE(12, 2);
  Buffer.from([100, 65, 172, 131, 17]).copy(flowSet, 4);
  return Buffer.concat([header(1, 11), flowSet]);
}

function ciscoBpaPacket(natEvent: 1 | 2): Buffer {
  const flowSet = Buffer.alloc(32);
  flowSet.writeUInt16BE(259, 0);
  flowSet.writeUInt16BE(32, 2);
  Buffer.from([100, 65, 172, 131]).copy(flowSet, 4);
  Buffer.from([203, 0, 113, 35]).copy(flowSet, 8);
  flowSet.writeUInt32BE(0, 12);
  flowSet.writeUInt8(17, 16);
  flowSet.writeUInt8(natEvent, 17);
  flowSet.writeBigUInt64BE(1783623038985n, 18);
  flowSet.writeUInt16BE(54274, 26);
  flowSet.writeUInt16BE(8, 28);
  flowSet.writeUInt16BE(512, 30);
  return Buffer.concat([header(1, 12 + natEvent), flowSet]);
}

function ciscoBpaTemplate(): NetflowTemplate {
  return {
    exporterIp: context.exporterIp,
    observationDomainId: 42,
    templateId: 259,
    fields: [
      { type: 8, length: 4 },
      { type: 225, length: 4 },
      { type: 234, length: 4 },
      { type: 4, length: 1 },
      { type: 230, length: 1 },
      { type: 323, length: 8 },
      { type: 361, length: 2 },
      { type: 363, length: 2 },
      { type: 364, length: 2 }
    ],
    updatedAt: context.receivedAt
  };
}

const context = {
  rawId: '20000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000002',
  collectorId: '20000000-0000-4000-8000-000000000003',
  deviceId: '20000000-0000-4000-8000-000000000004',
  vendor: 'cisco',
  exporterIp: '10.251.0.6',
  exporterPort: 2055,
  receivedAt: '2026-07-09T18:50:39.000Z'
};

describe('NetflowV9Parser', () => {
  it('mantém templates por exportador e decodifica os campos sem atribuir significado desconhecido', () => {
    const parser = new NetflowV9Parser(new MemoryTemplates());
    const template = parser.parse(templatePacket(), context);
    const data = parser.parse(dataPacket(), { ...context, rawId: '20000000-0000-4000-8000-000000000005' });

    expect(template.status).toBe('decoded_unmapped');
    expect(data.status).toBe('decoded_unmapped');
    expect(data.events).toHaveLength(0);
    expect(data.decoded).toMatchObject({
      header: { version: 9, sequence: 11, observationDomainId: 42 },
      records: [{
        templateId: 256,
        fields: [
          { type: 8, length: 4, valueHex: '6441ac83' },
          { type: 4, length: 1, valueHex: '11' }
        ]
      }]
    });
  });

  it('marca pacote dependente de template ainda não recebido', () => {
    const parser = new NetflowV9Parser(new MemoryTemplates());
    const result = parser.parse(dataPacket(), context);

    expect(result.status).toBe('missing_template');
    expect(result.events).toHaveLength(0);
    expect(result.error).toContain('256');
  });

  it.each([
    [1, 'allocated'],
    [2, 'deallocated']
  ] as const)('normaliza o evento BPA Cisco %i como %s', (natEvent, eventType) => {
    const templates = new MemoryTemplates();
    templates.put(ciscoBpaTemplate());
    const result = new NetflowV9Parser(templates).parse(ciscoBpaPacket(natEvent), context);

    expect(result.status).toBe('parsed');
    expect(result.error).toBe('');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      eventType,
      eventTypeRaw: String(natEvent),
      eventAt: '2026-07-09T18:50:38.985Z',
      privateIp: '100.65.172.131',
      publicIp: '203.0.113.35',
      protocol: 17,
      protocolName: 'UDP',
      portStart: 54274,
      portEnd: 58362,
      portMode: 'strided',
      portStep: 8,
      portCount: 512,
      parserVersion: 'netflow-v9/0.2.0'
    });
  });
});
