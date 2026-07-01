import {
  balanceKey,
  InsufficientStockError,
  isIncrease,
  MOVEMENT_SIGN,
  MovementType,
  nextBalance,
  reconcile,
  signedQuantity,
} from './inventory-math';

describe('inventory-math', () => {
  describe('movement signs', () => {
    it('classifies increases and decreases correctly', () => {
      expect(isIncrease('PURCHASE_RECEIPT')).toBe(true);
      expect(isIncrease('MATERIAL_ISSUE')).toBe(false);
      expect(isIncrease('CONTINGENT_RECOVERY')).toBe(true);
      expect(isIncrease('WAREHOUSE_TRANSFER_OUT')).toBe(false);
    });

    it('has a sign for every movement type', () => {
      const types = Object.keys(MOVEMENT_SIGN) as MovementType[];
      expect(types.length).toBe(14);
      for (const t of types) {
        expect([1, -1]).toContain(MOVEMENT_SIGN[t]);
      }
    });
  });

  describe('signedQuantity', () => {
    it('applies the movement direction to a positive magnitude', () => {
      expect(signedQuantity('PURCHASE_RECEIPT', 10)).toBe(10);
      expect(signedQuantity('MATERIAL_ISSUE', 10)).toBe(-10);
    });

    it('rejects non-positive magnitudes', () => {
      expect(() => signedQuantity('PURCHASE_RECEIPT', 0)).toThrow(/positive/);
      expect(() => signedQuantity('MATERIAL_ISSUE', -5)).toThrow(/positive/);
    });
  });

  describe('nextBalance', () => {
    it('adds increments', () => {
      expect(nextBalance(100, 25)).toBe(125);
    });

    it('subtracts decrements', () => {
      expect(nextBalance(100, -30)).toBe(70);
    });

    it('blocks a decrement that would go negative', () => {
      expect(() => nextBalance(10, -15)).toThrow(InsufficientStockError);
    });

    it('allows negative when explicitly permitted (authorized adjustment)', () => {
      expect(nextBalance(10, -15, true)).toBe(-5);
    });

    it('avoids binary-float drift', () => {
      expect(nextBalance(0.1, 0.2)).toBe(0.3);
    });
  });

  describe('reconcile', () => {
    it('folds ledger rows into per-bucket balances', () => {
      const rows = [
        { materialId: 'm1', warehouseId: 'w1', inventoryType: 'RAW_MATERIAL', quantity: 100 },
        { materialId: 'm1', warehouseId: 'w1', inventoryType: 'RAW_MATERIAL', quantity: -30 },
        { materialId: 'm1', warehouseId: 'w2', inventoryType: 'RAW_MATERIAL', quantity: 50 },
        { materialId: 'm1', warehouseId: 'w1', inventoryType: 'CONTINGENT', quantity: 5 },
      ];
      const balances = reconcile(rows);
      expect(balances.get(balanceKey('m1', 'w1', 'RAW_MATERIAL'))).toBe(70);
      expect(balances.get(balanceKey('m1', 'w2', 'RAW_MATERIAL'))).toBe(50);
      expect(balances.get(balanceKey('m1', 'w1', 'CONTINGENT'))).toBe(5);
    });

    it('keeps contingent stock separate from normal stock (distinct keys)', () => {
      expect(balanceKey('m1', 'w1', 'RAW_MATERIAL')).not.toBe(
        balanceKey('m1', 'w1', 'CONTINGENT'),
      );
    });

    it('separates batches within the same bucket', () => {
      const rows = [
        { materialId: 'm1', warehouseId: 'w1', inventoryType: 'RAW_MATERIAL', batchId: 'b1', quantity: 10 },
        { materialId: 'm1', warehouseId: 'w1', inventoryType: 'RAW_MATERIAL', batchId: 'b2', quantity: 20 },
      ];
      const balances = reconcile(rows);
      expect(balances.get(balanceKey('m1', 'w1', 'RAW_MATERIAL', 'b1'))).toBe(10);
      expect(balances.get(balanceKey('m1', 'w1', 'RAW_MATERIAL', 'b2'))).toBe(20);
    });
  });
});
