import { describe, expect, it } from 'vitest';
import { formatUtcForReport, localDateTimeToUtc, searchDateTimeToUtc } from '../src/core/timezone.js';

describe('conversão explícita de fuso da consulta', () => {
  it('converte horário de Brasília para UTC sem usar o fuso do computador', () => {
    expect(localDateTimeToUtc('2026-08-10T11:30:00', 'America/Sao_Paulo'))
      .toBe('2026-08-10T14:30:00.000Z');
  });

  it('mantém o instante quando o usuário informa UTC', () => {
    expect(localDateTimeToUtc('2026-08-10T14:30:00', 'UTC'))
      .toBe('2026-08-10T14:30:00.000Z');
  });

  it('aceita somente UTC ou o fuso cadastrado para o cliente', () => {
    expect(() => searchDateTimeToUtc(
      '2026-08-10T11:30:00',
      'America/Manaus',
      'America/Sao_Paulo'
    )).toThrow('não permitido');
  });

  it('rejeita datas e horários inexistentes', () => {
    expect(() => localDateTimeToUtc('2026-02-30T10:00:00', 'UTC')).toThrow('inválidos');
    expect(() => localDateTimeToUtc('2026-03-08T02:30:00', 'America/New_York')).toThrow('inexistente');
  });

  it('apresenta horários UTC no relatório sem milissegundos ou sufixo técnico', () => {
    expect(formatUtcForReport('2026-08-06T23:57:00.000Z')).toBe('2026-08-06 23:57:00');
    expect(formatUtcForReport('2026-08-06T23:56:55.985Z')).toBe('2026-08-06 23:56:55');
  });
});
