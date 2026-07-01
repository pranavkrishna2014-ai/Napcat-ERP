import { sanitize } from './sanitize';

describe('audit sanitize', () => {
  it('redacts sensitive keys (case-insensitive) at any depth', () => {
    const input = {
      username: 'admin',
      password: 'secret',
      nested: { newPassword: 'x', token: 'abc', keep: 1 },
      list: [{ passwordHash: 'h', name: 'ok' }],
    };
    expect(sanitize(input)).toEqual({
      username: 'admin',
      password: '[REDACTED]',
      nested: { newPassword: '[REDACTED]', token: '[REDACTED]', keep: 1 },
      list: [{ passwordHash: '[REDACTED]', name: 'ok' }],
    });
  });

  it('passes primitives through unchanged', () => {
    expect(sanitize(42)).toBe(42);
    expect(sanitize('hello')).toBe('hello');
    expect(sanitize(null)).toBeNull();
  });
});
