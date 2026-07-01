import { randomBytes, scrypt, ScryptOptions, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

/**
 * Password hashing using Node's built-in scrypt — no native dependencies, so it
 * builds and runs anywhere (important for this network-restricted environment).
 *
 * Stored format: `scrypt$N$saltHex$hashHex`. The parameters are embedded so the
 * cost can be raised later without breaking existing hashes.
 */

// promisify collapses scrypt's overloads and drops the options parameter;
// re-type it so we can pass the cost factor (N).
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const KEYLEN = 64;
const COST = 16384; // 2^14
const SALT_BYTES = 16;

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(plain, salt, KEYLEN, {
    N: COST,
  })) as Buffer;
  return `scrypt$${COST}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  if (!plain || !stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;

  const cost = Number(parts[1]);
  const salt = Buffer.from(parts[2], 'hex');
  const expected = Buffer.from(parts[3], 'hex');
  if (!Number.isFinite(cost) || salt.length === 0 || expected.length === 0) {
    return false;
  }

  const derived = (await scryptAsync(plain, salt, expected.length, {
    N: cost,
  })) as Buffer;

  // Constant-time comparison to avoid timing attacks.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
