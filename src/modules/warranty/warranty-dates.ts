/**
 * Warranty date arithmetic — pure and unit-tested.
 *
 * Warranty NEVER starts at manufacture. It begins on the Tally invoice date and
 * runs for the model policy's duration. Expiry is computed here.
 */

/** Add whole months to a date, clamping day-of-month overflow (e.g. Jan 31 + 1 → Feb 28). */
export function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();

  const target = new Date(Date.UTC(y, m + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  target.setUTCDate(Math.min(d, lastDay));
  target.setUTCHours(
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  );
  return target;
}

/** Warranty expiry = invoice date + policy duration (months). */
export function computeExpiry(invoiceDate: Date, durationMonths: number): Date {
  if (!(durationMonths >= 0) || !Number.isInteger(durationMonths)) {
    throw new Error('Warranty duration must be a non-negative integer of months');
  }
  return addMonths(invoiceDate, durationMonths);
}

/** True if `at` is on/before expiry (still covered). */
export function isCovered(expiryDate: Date, at: Date = new Date()): boolean {
  return at.getTime() <= expiryDate.getTime();
}

/** Whole days from `at` until expiry (negative once expired). */
export function daysUntilExpiry(expiryDate: Date, at: Date = new Date()): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.floor((expiryDate.getTime() - at.getTime()) / MS);
}
