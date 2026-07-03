import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { computeVariance } from '../../formula-engine';
import { InventoryService } from '../inventory/inventory.service';
import { round6 } from '../inventory/inventory-math';
import { TemplatesService } from './templates.service';
import { checkAvailability, RequirementLine } from './availability';

export interface CreateProductionOrderInput {
  templateId: string;
  salesOrderId?: string;
  salesOrderLineId?: string;
  quantity: number;
  length: number;
  width: number;
  height: number;
  borderWidth?: number;
  plannedDate?: Date;
  userId?: string;
}

export interface ConsumptionLine {
  materialId: string;
  actualQty: number;
  contingentRecoveredQty?: number;
  scrapQty?: number;
  /** Warehouse for any contingent/scrap movements this line generates. */
  warehouseId?: string;
}

/**
 * Formula-driven production. Creates production orders, computes their standard
 * material requirement via the Formula Engine, checks availability against the
 * inventory ledger, reserves and issues material, records actual consumption,
 * and computes production variance (standard vs actual).
 */
@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
    private readonly inventory: InventoryService,
  ) {}

  private orderNumber(): string {
    return `PO-${Date.now()}`;
  }

  /**
   * Create a production order and persist its standard material requirement
   * (computed dynamically — never a stored fixed quantity). The evaluated
   * formulas are snapshotted per material for full traceability.
   */
  async createOrder(input: CreateProductionOrderInput): Promise<unknown> {
    const scope = {
      LENGTH: input.length,
      WIDTH: input.width,
      HEIGHT: input.height,
      ...(input.borderWidth != null ? { BORDER_WIDTH: input.borderWidth } : {}),
    };
    const result = await this.templates.compute(
      input.templateId,
      scope,
      input.quantity,
    );

    return this.prisma.$transaction(async (tx: PrismaService) => {
      const order = await tx.productionOrder.create({
        data: {
          orderNumber: this.orderNumber(),
          templateId: input.templateId,
          salesOrderId: input.salesOrderId,
          salesOrderLineId: input.salesOrderLineId,
          status: 'PLANNED',
          quantity: input.quantity,
          length: input.length,
          width: input.width,
          height: input.height,
          plannedDate: input.plannedDate,
        },
      });

      for (const total of result.materialTotals) {
        const wastageRate =
          total.baseQtyPerUnit > 0
            ? round6(total.qtyPerUnitWithWastage / total.baseQtyPerUnit - 1)
            : 0;
        const formulaSnapshot = result.layers
          .filter((l) => l.materialId === total.materialId)
          .map((l) => l.formula)
          .join(' + ');

        await tx.materialRequirement.create({
          data: {
            productionOrderId: order.id,
            materialId: total.materialId,
            baseQtyPerUnit: total.baseQtyPerUnit,
            wastageRate,
            toleranceRate: total.toleranceRate,
            standardQty: total.standardQty,
            formulaSnapshot,
          },
        });
      }

      return tx.productionOrder.findUnique({
        where: { id: order.id },
        include: { requirements: { include: { material: true } } },
      });
    });
  }

  async getOrder(id: string): Promise<Record<string, unknown>> {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: {
        requirements: { include: { material: true } },
        reservations: true,
        consumptions: true,
        variances: true,
      },
    });
    if (!order) throw new NotFoundException('Production order not found');
    return order as Record<string, unknown>;
  }

  /** Standard requirement vs available (unreserved) stock, per material. */
  async checkAvailability(id: string) {
    const order = await this.getOrder(id);
    const requirements = (order.requirements as Array<Record<string, unknown>>) ?? [];

    const reqLines: RequirementLine[] = requirements.map((r) => ({
      materialId: r.materialId as string,
      materialName: (r.material as { name?: string })?.name,
      requiredQty: Number(r.standardQty),
    }));

    const balances = await this.prisma.stockBalance.findMany({
      where: {
        inventoryType: 'RAW_MATERIAL',
        materialId: { in: reqLines.map((r) => r.materialId) },
      },
    });
    const available = new Map<string, number>();
    for (const b of balances as Array<Record<string, unknown>>) {
      const net = Number(b.quantity) - Number(b.reservedQty ?? 0);
      available.set(
        b.materialId as string,
        (available.get(b.materialId as string) ?? 0) + net,
      );
    }

    return checkAvailability(reqLines, available);
  }

  /** Reserve the standard requirement for each material. */
  async reserve(id: string): Promise<unknown> {
    const order = await this.getOrder(id);
    const requirements = (order.requirements as Array<Record<string, unknown>>) ?? [];
    if (!requirements.length) {
      throw new BadRequestException('Order has no material requirements');
    }

    return this.prisma.$transaction(async (tx: PrismaService) => {
      for (const r of requirements) {
        await tx.materialReservation.upsert({
          where: {
            // requires a unique (productionOrderId, materialId) — see note
            productionOrderId_materialId: {
              productionOrderId: id,
              materialId: r.materialId as string,
            },
          },
          update: { quantity: Number(r.standardQty), status: 'RESERVED' },
          create: {
            productionOrderId: id,
            materialId: r.materialId as string,
            quantity: Number(r.standardQty),
            status: 'RESERVED',
          },
        });
      }
      return tx.productionOrder.update({
        where: { id },
        data: { status: 'MATERIAL_RESERVED' },
      });
    });
  }

  /**
   * Issue material to the order through the inventory ledger (one
   * MATERIAL_ISSUE movement per line), updating the matching reservation.
   */
  async issue(
    id: string,
    lines: Array<{
      materialId: string;
      warehouseId: string;
      quantity: number;
      batchId?: string;
    }>,
    userId?: string,
  ): Promise<unknown> {
    await this.getOrder(id);
    for (const line of lines) {
      await this.inventory.issue({
        materialId: line.materialId,
        warehouseId: line.warehouseId,
        batchId: line.batchId,
        inventoryType: 'RAW_MATERIAL',
        quantity: line.quantity,
        refType: 'PRODUCTION_ORDER',
        refId: id,
        userId,
      });
      await this.prisma.materialReservation.updateMany({
        where: { productionOrderId: id, materialId: line.materialId },
        data: { issuedQty: line.quantity, status: 'ISSUED' },
      });
    }
    return this.prisma.productionOrder.update({
      where: { id },
      data: { status: 'IN_PROGRESS' },
    });
  }

  /**
   * Record actual consumption and compute variance (standard vs actual) per
   * material. Any recovered contingent material or scrap is posted to the
   * ledger in the appropriate separate inventory.
   */
  async recordConsumption(
    id: string,
    lines: ConsumptionLine[],
    userId?: string,
  ): Promise<unknown> {
    const order = await this.getOrder(id);
    const requirements = (order.requirements as Array<Record<string, unknown>>) ?? [];
    const stdByMaterial = new Map<string, { std: number; tol: number }>();
    for (const r of requirements) {
      stdByMaterial.set(r.materialId as string, {
        std: Number(r.standardQty),
        tol: Number(r.toleranceRate),
      });
    }

    for (const line of lines) {
      await this.prisma.productionConsumption.create({
        data: {
          productionOrderId: id,
          materialId: line.materialId,
          actualQty: line.actualQty,
          contingentRecoveredQty: line.contingentRecoveredQty ?? 0,
          scrapQty: line.scrapQty ?? 0,
          recordedById: userId,
        },
      });

      const std = stdByMaterial.get(line.materialId);
      if (std) {
        const v = computeVariance(std.std, line.actualQty, std.tol);
        await this.prisma.productionVariance.upsert({
          where: {
            productionOrderId_materialId: {
              productionOrderId: id,
              materialId: line.materialId,
            },
          },
          update: {
            standardQty: std.std,
            actualQty: line.actualQty,
            varianceQty: v.varianceQty,
            variancePct: v.variancePct,
            toleranceRate: std.tol,
            status: v.status,
          },
          create: {
            productionOrderId: id,
            materialId: line.materialId,
            standardQty: std.std,
            actualQty: line.actualQty,
            varianceQty: v.varianceQty,
            variancePct: v.variancePct,
            toleranceRate: std.tol,
            status: v.status,
          },
        });
      }

      if (line.contingentRecoveredQty && line.warehouseId) {
        await this.inventory.contingentRecover({
          materialId: line.materialId,
          warehouseId: line.warehouseId,
          quantity: line.contingentRecoveredQty,
          refType: 'PRODUCTION_ORDER',
          refId: id,
          userId,
        });
      }
      if (line.scrapQty && line.warehouseId) {
        await this.inventory.scrap({
          materialId: line.materialId,
          warehouseId: line.warehouseId,
          quantity: line.scrapQty,
          refType: 'PRODUCTION_ORDER',
          refId: id,
          userId,
        });
      }
    }

    return this.getVariances(id);
  }

  getVariances(id: string) {
    return this.prisma.productionVariance.findMany({
      where: { productionOrderId: id },
      include: { material: true },
    });
  }
}
