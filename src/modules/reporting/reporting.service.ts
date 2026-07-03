import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { WarrantyService } from '../warranty/warranty.service';
import { DispatchService } from '../dispatch/dispatch.service';

/**
 * Management reporting — exceptions first. Dashboards surface what needs
 * attention (variance breaches, low stock, pending QC, expiring warranties,
 * open claims, dispatch mismatches), not raw data dumps.
 */
@Injectable()
export class ReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly warranty: WarrantyService,
    private readonly dispatch: DispatchService,
  ) {}

  /** Production variance breaches (the primary management view). */
  varianceExceptions() {
    return this.prisma.productionVariance.findMany({
      where: { status: 'EXCEPTION' },
      orderBy: { computedAt: 'desc' },
      include: { material: true, productionOrder: true },
      take: 200,
    });
  }

  /** Materials at or below their reorder level (across all warehouses). */
  async lowStock(): Promise<
    Array<{ materialId: string; name: string; onHand: number; reorderLevel: number }>
  > {
    const materials = (await this.prisma.material.findMany({
      where: { reorderLevel: { not: null }, isActive: true },
    })) as Array<Record<string, unknown>>;

    const balances = (await this.prisma.stockBalance.findMany({
      where: { inventoryType: 'RAW_MATERIAL' },
    })) as Array<Record<string, unknown>>;

    const onHand = new Map<string, number>();
    for (const b of balances) {
      const key = b.materialId as string;
      onHand.set(key, (onHand.get(key) ?? 0) + Number(b.quantity));
    }

    return materials
      .map((m) => ({
        materialId: m.id as string,
        name: m.name as string,
        onHand: onHand.get(m.id as string) ?? 0,
        reorderLevel: Number(m.reorderLevel),
      }))
      .filter((m) => m.onHand <= m.reorderLevel)
      .sort((a, b) => a.onHand - a.reorderLevel - (b.onHand - b.reorderLevel));
  }

  pendingQc() {
    return this.prisma.productionOrder.findMany({
      where: { status: 'QC_PENDING' },
      orderBy: { updatedAt: 'asc' },
      include: { template: { include: { variant: true } } },
      take: 200,
    });
  }

  contingentBalances() {
    return this.prisma.stockBalance.findMany({
      where: { inventoryType: 'CONTINGENT', quantity: { gt: 0 } },
      include: { material: true, warehouse: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  warrantyExpiring(days = 90) {
    return this.warranty.listExpiring(days);
  }

  openClaims() {
    return this.prisma.warrantyClaim.findMany({
      where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      orderBy: { reportedAt: 'asc' },
      include: { warranty: { include: { serialNumber: true } } },
      take: 200,
    });
  }

  dispatchReconciliation() {
    return this.dispatch.reconcile();
  }

  /** One-glance management summary: counts of everything needing attention. */
  async summary(): Promise<Record<string, number | boolean>> {
    const [
      varianceExceptions,
      pendingQc,
      openClaims,
      inProduction,
      pendingApproval,
      lowStock,
      recon,
    ] = await Promise.all([
      this.prisma.productionVariance.count({ where: { status: 'EXCEPTION' } }),
      this.prisma.productionOrder.count({ where: { status: 'QC_PENDING' } }),
      this.prisma.warrantyClaim.count({
        where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      }),
      this.prisma.productionOrder.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.salesOrder.count({ where: { status: 'PENDING_APPROVAL' } }),
      this.lowStock(),
      this.dispatch.reconcile(),
    ]);

    return {
      varianceExceptions,
      pendingQc,
      openClaims,
      inProduction,
      salesOrdersAwaitingApproval: pendingApproval,
      lowStockMaterials: lowStock.length,
      dispatchMismatches:
        recon.dispatchedNotInvoiced.length + recon.invoicedNotDispatched.length,
      allClear:
        varianceExceptions === 0 &&
        openClaims === 0 &&
        lowStock.length === 0 &&
        recon.ok,
    };
  }
}
