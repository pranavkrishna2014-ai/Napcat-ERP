import { hashPassword, verifyPassword } from './password.util';

describe('password util', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('operator-123');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('operator-123', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('operator-123');
    expect(await verifyPassword('wrong-pass', hash)).toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const a = await hashPassword('samePassword1');
    const b = await hashPassword('samePassword1');
    expect(a).not.toBe(b);
    expect(await verifyPassword('samePassword1', a)).toBe(true);
    expect(await verifyPassword('samePassword1', b)).toBe(true);
  });

  it('enforces a minimum length', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/at least 8/);
  });

  it('returns false for malformed stored hashes', async () => {
    expect(await verifyPassword('whatever', 'not-a-valid-hash')).toBe(false);
    expect(await verifyPassword('whatever', '')).toBe(false);
  });
});
