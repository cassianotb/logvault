import { deterministicId } from '../core/crypto.js';
import type { CgnatEvent, ParseContext, ParseResult } from '../domain/models.js';
import type { PacketParser } from './parser.js';

const PARSER_VERSION = 'a10-syslog/0.4.0';
const EVENT_PATTERN = /LSN:PortBatchV2(?<action>[A-Za-z]+):(?<protocol>TCP|UDP|OTHER|-)\s+\[(?<privateIp>\d{1,3}(?:\.\d{1,3}){3})\s+(?<publicIp>\d{1,3}(?:\.\d{1,3}){3})\s+(?<portStart>\d{1,5})\s+(?<portEnd>\d{1,5})\]/i;
const ISO_TIME_PATTERN = /\b(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))\b/;
const RFC5424_SENDER_PATTERN = /^<\d{1,3}>1\s+\S+\s+(?<sender>\d{1,3}(?:\.\d{1,3}){3})\s+/;
const PORT_EVENT_PROTOCOL_PATTERN = /\bLSN:Port(?:BatchV2)?(?:Allocated|Freed):(?<protocol>[A-Za-z0-9_-]+)\s+\[/;

const actionMapping: Readonly<Record<string, CgnatEvent['eventType']>> = {
  Allocated: 'allocated',
  Freed: 'deallocated'
};

function validIpv4(value: string): boolean {
  const octets = value.split('.');
  return octets.length === 4 && octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) return false;
    const number = Number(octet);
    return number >= 0 && number <= 255;
  });
}

export function a10SyslogReportedIp(payload: Buffer | string): string | null {
  const message = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
  const sender = RFC5424_SENDER_PATTERN.exec(message)?.groups?.sender;
  return sender && validIpv4(sender) ? sender : null;
}

export function isA10HealthProbe(payload: Buffer | string): boolean {
  const message = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
  return message.replace(/\0+$/g, '').trim() === 'A10';
}

export function isA10IgnoredProtocolEvent(
  payload: Buffer | string,
  ignoredProtocols: readonly string[]
): boolean {
  const message = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
  const protocol = PORT_EVENT_PROTOCOL_PATTERN.exec(message)?.groups?.protocol?.toUpperCase();
  return protocol !== undefined && ignoredProtocols.includes(protocol);
}

function normalizedProtocols(value: string): ReadonlyArray<{ number: number; name: 'TCP' | 'UDP' }> {
  const protocol = value.toUpperCase();
  if (protocol === 'TCP') return [{ number: 6, name: 'TCP' }];
  if (protocol === 'UDP') return [{ number: 17, name: 'UDP' }];
  return [
    { number: 6, name: 'TCP' },
    { number: 17, name: 'UDP' }
  ];
}

export class A10SyslogParser implements PacketParser {
  parse(payload: Buffer, context: ParseContext): ParseResult {
    const message = payload.toString('utf8').replace(/\0+$/g, '').trim();
    const transportIp = context.transportIp ?? context.exporterIp;
    if (isA10HealthProbe(message)) {
      return this.result('health_probe', null, { message, kind: 'health_probe', transportIp }, [], '');
    }
    const match = EVENT_PATTERN.exec(message);
    if (!match?.groups) return this.result('unrecognized', null, { message }, [], '');
    const action = match.groups.action;
    const protocolRaw = match.groups.protocol;
    const privateIp = match.groups.privateIp;
    const publicIp = match.groups.publicIp;
    const portStartRaw = match.groups.portStart;
    const portEndRaw = match.groups.portEnd;
    if (!action || !protocolRaw || !privateIp || !publicIp || !portStartRaw || !portEndRaw) {
      return this.result('error', null, { message }, [], 'Mensagem A10 incompleta');
    }

    const timestampMatch = ISO_TIME_PATTERN.exec(message);
    const exporterTime = timestampMatch?.groups?.timestamp
      ? new Date(timestampMatch.groups.timestamp).toISOString()
      : null;
    const eventType = actionMapping[action];
    const reportedExporterIp = a10SyslogReportedIp(message);
    const decoded = { message, ...match.groups, exporterTime, reportedExporterIp, transportIp };

    if (!eventType) {
      return this.result('decoded_unmapped', exporterTime, decoded, [], `Evento A10 sem mapeamento explícito: ${action}`);
    }
    if (!exporterTime) {
      return this.result('decoded_unmapped', null, decoded, [], 'Mensagem sem timestamp ISO 8601 explícito');
    }

    const portStart = Number(portStartRaw);
    const portEnd = Number(portEndRaw);
    if (portStart < 0 || portEnd > 65535 || portStart > portEnd) {
      return this.result('error', exporterTime, decoded, [], 'Intervalo de portas inválido');
    }

    const protocols = normalizedProtocols(protocolRaw);
    const sharedProtocolAllocation = protocols.length > 1;
    const events: CgnatEvent[] = protocols.map((protocol, recordIndex) => ({
      eventId: deterministicId('a10-port-batch-v2', context.rawId, recordIndex),
      rawId: context.rawId,
      batchId: null,
      recordIndex,
      tenantId: context.tenantId,
      collectorId: context.collectorId,
      deviceId: context.deviceId,
      vendor: context.vendor,
      sourceType: 'syslog',
      eventAt: exporterTime,
      receivedAt: context.receivedAt,
      publicIp,
      privateIp,
      protocol: protocol.number,
      protocolName: protocol.name,
      portStart,
      portEnd,
      portMode: 'contiguous',
      portStep: 1,
      portCount: portEnd - portStart + 1,
      eventType,
      eventTypeRaw: action,
      vendorFields: {
        message,
        action,
        protocolRaw,
        protocolScope: sharedProtocolAllocation ? 'shared_tcp_udp' : 'single',
        reportedExporterIp: reportedExporterIp ?? '',
        transportIp
      },
      parserVersion: PARSER_VERSION
    }));

    return this.result('parsed', exporterTime, decoded, events, '');
  }

  private result(
    status: ParseResult['status'],
    exporterTime: string | null,
    decoded: unknown,
    events: CgnatEvent[],
    error: string
  ): ParseResult {
    return {
      status,
      parserVersion: PARSER_VERSION,
      exporterTime,
      observationDomainId: null,
      exportSequence: null,
      templateId: null,
      decoded,
      events,
      error
    };
  }
}
