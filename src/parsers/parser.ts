import type { ParseContext, ParseResult } from '../domain/models.js';

export interface PacketParser {
  parse(payload: Buffer, context: ParseContext): ParseResult;
}

