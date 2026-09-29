import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface PrimaryContinuityPreparation {
  bind: string;
  cidr: string;
}

function parseResponse(contents: string): Record<string, string> {
  return Object.fromEntries(contents.split('\n').filter(Boolean).map((line) => {
    const separator = line.indexOf('=');
    return separator < 0 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

export async function preparePrimaryContinuity(input: {
  controlDirectory: string;
  siteAHost: string;
  siteBHost: string;
  timeoutMs?: number;
}): Promise<PrimaryContinuityPreparation> {
  const { controlDirectory, siteAHost, siteBHost } = input;
  const request = join(controlDirectory, 'request.env');
  const response = join(controlDirectory, 'response.env');
  const nonce = randomBytes(32).toString('hex');
  await mkdir(controlDirectory, { recursive: true });
  try {
    await stat(request);
    throw new Error('já existe uma preparação de continuidade em andamento');
  } catch (error) {
    if (error instanceof Error && error.message.includes('já existe')) throw error;
  }
  await rm(response, { force: true });
  const temporary = join(controlDirectory, `.request-${nonce}.tmp`);
  await writeFile(temporary, `nonce=${nonce}\nsite_a_host=${siteAHost}\nsite_b_host=${siteBHost}\n`, { mode: 0o660 });
  await rename(temporary, request);

  const deadline = Date.now() + (input.timeoutMs ?? 120_000);
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const parsed = parseResponse(await readFile(response, 'utf8'));
      if (parsed.nonce !== nonce) continue;
      await rm(response, { force: true });
      if (parsed.status !== 'ok') throw new Error(parsed.message || 'o agente do DC-A não concluiu a preparação');
      if (!parsed.bind || !parsed.cidr) throw new Error('resposta incompleta do agente do DC-A');
      return { bind: parsed.bind, cidr: parsed.cidr };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
  }
  throw new Error('tempo limite excedido ao preparar o DC-A');
}
