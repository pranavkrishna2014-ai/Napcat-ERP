import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  InsufficientStockError,
  MovementType,
  nextBalance,
  reconcile,
  signedQuantity,
} from './inventory-math';

/**
 * Prisma transaction client. The generated type isn't available in this
 * sandbox (engine binaries can't be downloaded), so it's kept structural; it
 * resolves to Prisma.TransactionClient once the client is generated.
 */
type Tx = PrismaService;

export interface MovementInput {
  movementType: MovementType;
  inventoryType: string;
  materialId?: string | null;
  warehouseId: string;
  batchId?: string | null;
  serialNumberId?: string | null;
  /** Positive magnitude; the movement type dictates the direction. */
  quantity: number;
  /** Only ADMIN-authorized adjustments may drive a balance negative. */
  allowNegative?: boolean;
  refType?: string;
  refId?: string;
  note?: string;
  userId?: string;
}

export interface ReconcileDiff {
  materialId: string | null;
  warehouseId: string;
  inventoryType: string;
  batchId: string | null;
  cached: number;
  ledger: number;
  drift: number;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The single choke point for every stock change. In one transaction it:
   *   1. computes the signed delta and the new balance (guarding against
   *      negative stock unless explicitly authorized),
   *   2. appends an immutable InventoryLedger row carrying balanceAfter,
   *   3. upserts the derived StockBalance cache.
   * Nothing else in the ERP writes to stock directly.
   */
  async postMovement(input: MovementInput): Promise<unknown> {
    return this.prisma.$transaction((tx: Tx) => this.apply(tx, input));
  }

  /** Apply a movement within an existing transaction (used by transfers). */
  private async apply(tx: Tx, input: MovementInput): Promise<unknown> {
    const delta = signedQuantity(input.movementType, input.quantity);

    const existing = await tx.stockBalance.findFirst({
      where: {
        materialId: input.materialId ?? null,
        warehouseId: input.warehouseId,
        inventoryType: input.inventoryType,
        batchId: input.batchId ?? null,
      },
    });
    const current = existing ? Number(existing.quantity) : 0;

    let balanceAfter: number;
    try {
      balanceAfter = nextBalance(current, delta, input.allowNegative ?? false);
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    const ledger = await tx.inventoryLedger.create({
      data: {
        movementType: input.movementType,
        inventoryType: input.inventoryType,
        materialId: input.materialId ?? null,
        warehouseId: input.warehouseId,
        batchId: input.batchId ?? null,
        serialNumberId: input.serialNumberId ?? null,
        quantity: delta,
        balanceAfter,
        refType: input.refType,
        refId: input.refId,
        note: input.note,
        createdById: input.userId,
      },
    });

    if (existing) {
      await tx.stockBalance.update({
        where: { id: existing.id },
        data: { quantity: balanceAfter },
      });
    } else {
      await tx.stockBalance.create({
        data: {
          materialId: input.materialId ?? null,
          warehouseId: input.warehouseId,
          inventoryType: input.inventoryType,
          batchId: input.batchId ?? null,
          quantity: balanceAfter,
        },
      });
    }

    return ledger;
  }

  // --- Higher-level operations ---------------------------------------------

  /** Goods received into stock (quantity only — costing stays in Tally). */
  receipt(input: Omit<MovementInput, 'movementType'> & { opening?: boolean }) {
    return this.postMovement({
      ...input,
      movementType: input.opening ? 'OPENING_BALANCE' : 'PURCHASE_RECEIPT',
    });
  }

  /** Issue material to a production order. */
  issue(input: Omit<MovementInput, 'movementType'>) {
    return this.postMovement({ ...input, movementType: 'MATERIAL_ISSUE' });
  }

  /** Return unused material from a production order. */
  returnMaterial(input: Omit<MovementInput, 'movementType'>) {
    return this.postMovement({ ...input, movementType: 'MATERIAL_RETURN' });
  }

  /** Move scrap into scrap inventory. */
  scrap(input: Omit<MovementInput, 'movementType' | 'inventoryType'>) {
    return this.postMovement({
      ...input,
      inventoryType: 'SCRAP',
      movementType: 'SCRAP_GENERATION',
    });
  }

  /** Record recoverable foam/latex into (separate) contingent inventory. */
  contingentRecover(
    input: Omit<MovementInput, 'movementType' | 'inventoryType'>,
  ) {
    return this.postMovement({
      ...input,
      inventoryType: 'CONTINGENT',
      movementType: 'CONTINGENT_RECOVERY',
    });
  }

  /** Consume contingent inventory back into production. */
  contingentConsume(
    input: Omit<MovementInput, 'movementType' | 'inventoryType'>,
  ) {
    return this.postMovement({
      ...input,
      inventoryType: 'CONTINGENT',
      movementType: 'CONTINGENT_CONSUMPTION',
    });
  }

  /**
   * Authorized stock adjustment (ADMIN only). A positive delta increases stock,
   * a negative delta decreases it; a reason is mandatory and recorded.
   */
  async adjust(input: {
    inventoryType: string;
    materialId?: string | null;
    warehouseId: string;
    batchId?: string | null;
    /** Signed target delta: +increase / -decrease. */
    delta: number;
    reason: string;
    userId?: string;
  }): Promise<unknown> {
    if (!input.reason?.trim()) {
      throw new BadRequestException('An adjustment reason is required');
    }
    if (input.delta === 0) {
      throw new BadRequestException('Adjustment delta must be non-zero');
    }
    return this.postMovement({
      movementType:
        input.delta > 0 ? 'ADJUSTMENT_INCREASE' : 'ADJUSTMENT_DECREASE',
      inventoryType: input.inventoryType,
      materialId: input.materialId,
      warehouseId: input.warehouseId,
      batchId: input.batchId,
      quantity: Math.abs(input.delta),
      allowNegative: true, // authorized correction
      refType: 'ADJUSTMENT',
      note: input.reason,
      userId: input.userId,
    });
  }

  /**
   * Warehouse-to-warehouse transfer: one TRANSFER_OUT and one TRANSFER_IN in a
   * single transaction, both referencing the created WarehouseTransfer.
   */
  async transfer(input: {
    materialId: string;
    inventoryType: string;
    batchId?: string | null;
    sourceWarehouseId: string;
    destinationWarehouseId: string;
    quantity: number;
    note?: string;
    userId?: string;
  }): Promise<unknown> {
    if (input.sourceWarehouseId === input.destinationWarehouseId) {
      throw new BadRequestException(
        'Source and destination warehouses must differ',
      );
    }
    return this.prisma.$transaction(async (tx: Tx) => {
      const transfer = await tx.warehouseTransfer.create({
        data: {
          reference: `TRF-${Date.now()}`,
          sourceId: input.sourceWarehouseId,
          destinationId: input.destinationWarehouseId,
          note: input.note,
          createdById: input.userId,
        },
      });
      const common = {
        materialId: input.materialId,
        inventoryType: input.inventoryType,
        batchId: input.batchId,
        quantity: input.quantity,
        refType: 'WAREHOUSE_TRANSFER',
        refId: transfer.id,
        note: input.note,
        userId: input.userId,
      };
      await this.apply(tx, {
        ...common,
        movementType: 'WAREHOUSE_TRANSFER_OUT',
        warehouseId: input.sourceWarehouseId,
      });
      await this.apply(tx, {
        ...common,
        movementType: 'WAREHOUSE_TRANSFER_IN',
        warehouseId: input.destinationWarehouseId,
      });
      return transfer;
    });
  }

  // --- Queries & reconciliation --------------------------------------------

  /** Current balances with optional filters (barcode/QR lookups build on this). */
  balances(filter: {
    materialId?: string;
    warehouseId?: string;
    inventoryType?: string;
  }) {
    return this.prisma.stockBalance.findMany({
      where: {
        materialId: filter.materialId,
        warehouseId: filter.warehouseId,
        inventoryType: filter.inventoryType,
      },
      include: { material: true, warehouse: true },
    });
  }

  /** Barcode/QR-ready lookup: all balances for a material by its code. */
  async balancesByMaterialCode(code: string) {
    const material = await this.prisma.material.findUnique({ where: { code } });
    if (!material) throw new BadRequestException(`Unknown material code "${code}"`);
    return this.balances({ materialId: material.id });
  }

  /** Ledger history with filters and pagination. */
  async ledger(filter: {
    materialId?: string;
    warehouseId?: string;
    inventoryType?: string;
    refType?: string;
    refId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(filter.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(filter.pageSize) || 50));
    const where = {
      materialId: filter.materialId,
      warehouseId: filter.warehouseId,
      inventoryType: filter.inventoryType,
      refType: filter.refType,
      refId: filter.refId,
    };
    const [data, total] = await Promise.all([
      this.prisma.inventoryLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inventoryLedger.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  /**
   * Recompute balances purely from the ledger and compare to the cached
   * StockBalance rows, reporting any drift. Proves ledger integrity.
   */
  async reconcileAll(): Promise<{ ok: boolean; diffs: ReconcileDiff[] }> {
    const [rows, cached] = await Promise.all([
      this.prisma.inventoryLedger.findMany({
        select: {
          materialId: true,
          warehouseId: true,
          inventoryType: true,
          batchId: true,
          quantity: true,
        },
      }),
      this.prisma.stockBalance.findMany(),
    ]);

    const computed = reconcile(
      rows.map((r: Record<string, unknown>) => ({
        materialId: r.materialId as string | null,
        warehouseId: r.warehouseId as string,
        inventoryType: r.inventoryType as string,
        batchId: r.batchId as string | null,
        quantity: Number(r.quantity),
      })),
    );

    const diffs: ReconcileDiff[] = [];
    for (const c of cached as Record<string, unknown>[]) {
      const key = [
        (c.materialId as string) ?? '-',
        c.warehouseId as string,
        c.inventoryType as string,
        (c.batchId as string) ?? '-',
      ].join('::');
      const ledgerBal = computed.get(key) ?? 0;
      const cachedBal = Number(c.quantity);
      if (Math.abs(ledgerBal - cachedBal) > 1e-6) {
        diffs.push({
          materialId: (c.materialId as string) ?? null,
          warehouseId: c.warehouseId as string,
          inventoryType: c.inventoryType as string,
          batchId: (c.batchId as string) ?? null,
          cached: cachedBal,
          ledger: ledgerBal,
          drift: Number((ledgerBal - cachedBal).toFixed(6)),
        });
      }
    }
    return { ok: diffs.length === 0, diffs };
  }
}
