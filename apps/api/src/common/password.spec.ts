import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { hashPassword, passwordNeedsRehash, PASSWORD_COST } from './password';

describe('password hashing', () => {
  it('uses the current cost and identifies older hashes for upgrade', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(bcrypt.getRounds(hash)).toBe(PASSWORD_COST);
    expect(passwordNeedsRehash(hash)).toBe(false);
    expect(passwordNeedsRehash(await bcrypt.hash('legacy password', 4))).toBe(true);
    expect(passwordNeedsRehash('not a bcrypt hash')).toBe(false);
  });
});
