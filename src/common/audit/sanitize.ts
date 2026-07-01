/** Keys never written to the audit log (secrets / noise). */
const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'newpassword',
  'currentpassword',
  'token',
  'accesstoken',
]);

/** Deep-clone while redacting sensitive fields so secrets never hit the log. */
export function sanitize(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACTED_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : sanitize(v);
  }
  return out;
}
