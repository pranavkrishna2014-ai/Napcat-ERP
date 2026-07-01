/**
 * Pure inventory arithmetic — no database, no framework, fully unit-tested.
 *
 * The InventoryLedger is append-only and authoritative: every movement stores a
 * SIGNED quantity and the running balance after it. StockBalance is only a
 * derived cache and must always be reconstructable from the ledger. These
 * functions encode the rules that make that guarantee hold.
 */

/** All ledger movement reasons. Mirrors the Prisma `LedgerMovementType` enum. */
export type MovementType =
  | 'OPENING_BALANCE'
  | 'PURCHASE_RECEIPT'
  | 'MATERIAL_ISSUE'
  | 'MATERIAL_RETURN'
  | 'PRODUCTION_OUTPUT'
  | 'PRODUCTION_CONSUMPTION'
  | 'CONTINGENT_RECOVERY'
  | 'CONTINGENT_CONSUMPTION'
  | 'SCRAP_GENERATION'
  | 'WAREHOUSE_TRANSFER_OUT'
  | 'WAREHOUSE_TRANSFER_IN'
  | 'DISPATCH_ISSUE'
  | 'ADJUSTMENT_INCREASE'
  | 'ADJUSTMENT_DECREASE';

/** Intrinsic direction of each movement: +1 increases stock, -1 decreases it. */
export const MOVEMENT_SIGN: Record<MovementType, 1 | -1> = {
  OPENING_BALANCE: 1,
  PURCHASE_RECEIPT: 1,
  MATERIAL_ISSUE: -1,
  MATERIAL_RETURN: 1,
  PRODUCTION_OUTPUT: 1,
  PRODUCTION_CONSUMPTION: -1,
  CONTINGENT_RECOVERY: 1,
  CONTINGENT_CONSUMPTION: -1,
  SCRAP_GENERATION: 1,
  WAREHOUSE_TRANSFER_OUT: -1,
  WAREHOUSE_TRANSFER_IN: 1,
  DISPATCH_ISSUE: -1,
  ADJUSTMENT_INCREASE: 1,
  ADJUSTMENT_DECREASE: -1,
};

export function isIncrease(type: MovementType): boolean {
  return MOVEMENT_SIGN[type] === 1;
}

/** Thrown when a decrement would drive a balance below zero. */
export class InsufficientStockError extends Error {
  constructor(
    public readonly available: number,
    public readonly requested: number,
  ) {
    super(
      `Insufficient stock: available ${available}, requested ${requested}`,
    );
    this.name = 'InsufficientStockError';
  }
}

/**
 * Convert a positive magnitude to the signed delta for a movement type.
 * Rejects non-positive magnitudes — callers always pass a positive quantity and
 * the movement type dictates the direction.
 */
export function signedQuantity(type: MovementType, magnitude: number): number {
  if (!(magnitude > 0)) {
    throw new Error(`Quantity must be positive, got ${magnitude}`);
  }
  return round6(MOVEMENT_SIGN[type] * magnitude);
}

/**
 * Compute the balance after applying a signed delta. Decrements may not drive
 * the balance negative unless explicitly allowed (adjustments only).
 */
export function nextBalance(
  current: number,
  signedDelta: number,
  allowNegative = false,
): number {
  const next = round6(current + signedDelta);
  if (!allowNegative && next < 0) {
    throw new InsufficientStockError(current, -signedDelta);
  }
  return next;
}

/**
 * Composite key identifying a stock bucket: one balance per
 * (material, warehouse, inventory type, batch).
 */
export function balanceKey(
  materialId: string | null | undefined,
  warehouseId: string,
  inventoryType: string,
  batchId?: string | null,
): string {
  return [materialId ?? '-', warehouseId, inventoryType, batchId ?? '-'].join(
    '::',
  );
}

export interface LedgerLike {
  materialId?: string | null;
  warehouseId: string;
  inventoryType: string;
  batchId?: string | null;
  /** Signed quantity as stored in the ledger. */
  quantity: number;
}

/**
 * Fold ledger rows into per-bucket balances. This is the reconciliation
 * primitive: recompute balances purely from the ledger and compare against the
 * cached StockBalance rows to detect drift or tampering.
 */
export function reconcile(rows: LedgerLike[]): Map<string, number> {
  const balances = new Map<string, number>();
  for (const row of rows) {
    const key = balanceKey(
      row.materialId,
      row.warehouseId,
      row.inventoryType,
      row.batchId,
    );
    balances.set(key, round6((balances.get(key) ?? 0) + row.quantity));
  }
  return balances;
}

/** Round to 6 dp to avoid binary-float drift in quantities. */
export function round6(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}
