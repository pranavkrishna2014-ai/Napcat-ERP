import {
  addMonths,
  computeExpiry,
  daysUntilExpiry,
  isCovered,
} from './warranty-dates';
import { validateClaim } from './claim-validation';

describe('warranty dates', () => {
  it('adds months and clamps end-of-month overflow', () => {
    expect(addMonths(new Date(Date.UTC(2026, 0, 31)), 1)).toEqual(
      new Date(Date.UTC(2026, 1, 28)), // Feb 2026 has 28 days
    );
    expect(addMonths(new Date(Date.UTC(2026, 6, 3)), 12)).toEqual(
      new Date(Date.UTC(2027, 6, 3)),
    );
  });

  it('computes expiry from the invoice date + policy months', () => {
    const invoice = new Date(Date.UTC(2026, 6, 3));
    expect(computeExpiry(invoice, 120)).toEqual(new Date(Date.UTC(2036, 6, 3)));
  });

  it('rejects a non-integer/negative duration', () => {
    expect(() => computeExpiry(new Date(), -1)).toThrow();
    expect(() => computeExpiry(new Date(), 1.5)).toThrow();
  });

  it('reports coverage and days remaining', () => {
    const expiry = new Date(Date.UTC(2026, 6, 13));
    const at = new Date(Date.UTC(2026, 6, 3));
    expect(isCovered(expiry, at)).toBe(true);
    expect(isCovered(new Date(Date.UTC(2026, 5, 1)), at)).toBe(false);
    expect(daysUntilExpiry(expiry, at)).toBe(10);
  });
});

describe('validateClaim', () => {
  const base = {
    serialFound: true,
    warrantyStatus: 'ACTIVE' as const,
    expiryDate: new Date(Date.UTC(2036, 0, 1)),
    now: new Date(Date.UTC(2026, 6, 3)),
  };

  it('passes a valid active in-period claim', () => {
    expect(validateClaim(base)).toEqual({ ok: true, reasons: [] });
  });

  it('short-circuits when the serial is unknown', () => {
    const r = validateClaim({ serialFound: false });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(['Serial number not found']);
  });

  it('rejects a not-yet-activated warranty', () => {
    const r = validateClaim({ ...base, warrantyStatus: 'PENDING_ACTIVATION' });
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toMatch(/not activated/);
  });

  it('rejects an expired warranty', () => {
    const r = validateClaim({ ...base, expiryDate: new Date(Date.UTC(2020, 0, 1)) });
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toMatch(/expired/);
  });

  it('rejects a dealer mismatch', () => {
    const r = validateClaim({
      ...base,
      warrantyDealerId: 'd1',
      claimDealerId: 'd2',
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toMatch(/Dealer does not match/);
  });

  it('rejects an already-replaced unit', () => {
    const r = validateClaim({ ...base, alreadyReplaced: true });
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toMatch(/already been replaced/);
  });
});
