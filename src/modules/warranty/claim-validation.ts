import { isCovered } from './warranty-dates';

/**
 * Warranty claim validation — pure and unit-tested.
 *
 * Every claim must validate against: a known serial, an active/activated
 * warranty, the warranty period, the dealer of record, and prior claim history
 * (a unit already replaced cannot be claimed again).
 */

export interface ClaimContext {
  serialFound: boolean;
  warrantyStatus?: 'PENDING_ACTIVATION' | 'ACTIVE' | 'EXPIRED' | 'VOID';
  expiryDate?: Date | null;
  /** Dealer on the warranty record. */
  warrantyDealerId?: string | null;
  /** Dealer raising the claim (optional; must match if provided). */
  claimDealerId?: string | null;
  /** Whether this unit was already replaced under a prior claim. */
  alreadyReplaced?: boolean;
  now?: Date;
}

export interface ClaimValidation {
  ok: boolean;
  reasons: string[];
}

export function validateClaim(ctx: ClaimContext): ClaimValidation {
  const reasons: string[] = [];
  const now = ctx.now ?? new Date();

  if (!ctx.serialFound) {
    reasons.push('Serial number not found');
    return { ok: false, reasons }; // nothing else can be checked
  }
  if (ctx.warrantyStatus == null || ctx.warrantyStatus === 'PENDING_ACTIVATION') {
    reasons.push('Warranty not activated (no synced invoice yet)');
  }
  if (ctx.warrantyStatus === 'VOID') {
    reasons.push('Warranty is void');
  }
  if (!ctx.expiryDate) {
    reasons.push('Warranty has no expiry date');
  } else if (!isCovered(ctx.expiryDate, now)) {
    reasons.push('Warranty period has expired');
  }
  if (
    ctx.claimDealerId &&
    ctx.warrantyDealerId &&
    ctx.claimDealerId !== ctx.warrantyDealerId
  ) {
    reasons.push('Dealer does not match the warranty record');
  }
  if (ctx.alreadyReplaced) {
    reasons.push('Unit has already been replaced under a prior claim');
  }

  return { ok: reasons.length === 0, reasons };
}
