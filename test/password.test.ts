import { expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/core/password.js';

it('gera hash scrypt e valida apenas a senha correta', async () => {
  const encoded = await hashPassword('uma-senha-forte-para-teste');

  expect(encoded).toMatch(/^scrypt\$16384\$8\$1\$/);
  expect(await verifyPassword('uma-senha-forte-para-teste', encoded)).toBe(true);
  expect(await verifyPassword('senha-incorreta', encoded)).toBe(false);
});

it('rejeita hash de senha inválido sem lançar exceção', async () => {
  expect(await verifyPassword('qualquer', 'formato-invalido')).toBe(false);
});
