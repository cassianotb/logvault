const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function validParts(parts: DateTimeParts): boolean {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  return date.getUTCFullYear() === parts.year
    && date.getUTCMonth() === parts.month - 1
    && date.getUTCDate() === parts.day
    && date.getUTCHours() === parts.hour
    && date.getUTCMinutes() === parts.minute
    && date.getUTCSeconds() === parts.second;
}

function parseLocalDateTime(value: string): DateTimeParts {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) throw new Error('Data e horário local inválidos');
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0)
  };
  if (!validParts(parts)) throw new Error('Data e horário local inválidos');
  return parts;
}

function partsAt(instantMs: number, timezone: string): DateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const values = new Map(formatter.formatToParts(new Date(instantMs)).map((part) => [part.type, part.value]));
  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
    hour: Number(values.get('hour')),
    minute: Number(values.get('minute')),
    second: Number(values.get('second'))
  };
}

function partsEpoch(parts: DateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function sameParts(left: DateTimeParts, right: DateTimeParts): boolean {
  return partsEpoch(left) === partsEpoch(right);
}

export function localDateTimeToUtc(value: string, timezone: string): string {
  const target = parseLocalDateTime(value);
  if (timezone === 'UTC') return new Date(partsEpoch(target)).toISOString();

  let instant = partsEpoch(target);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const difference = partsEpoch(target) - partsEpoch(partsAt(instant, timezone));
    instant += difference;
    if (difference === 0) break;
  }
  if (!sameParts(partsAt(instant, timezone), target)) {
    throw new Error('Horário inexistente no fuso selecionado');
  }

  const ambiguous = [-2, -1, 1, 2]
    .map((hours) => instant + hours * 60 * 60 * 1000)
    .some((candidate) => sameParts(partsAt(candidate, timezone), target));
  if (ambiguous) throw new Error('Horário ambíguo no fuso selecionado; use UTC');
  return new Date(instant).toISOString();
}

export function searchDateTimeToUtc(value: string, timezone: string, tenantTimezone: string): string {
  if (timezone !== 'UTC' && timezone !== tenantTimezone) {
    throw new Error('Fuso horário não permitido para este cliente');
  }
  return localDateTimeToUtc(value, timezone);
}

export function formatUtcForReport(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    return value.replace('T', ' ').replace(/\.\d+Z$/, '');
  }
  return instant.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}
