import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { buildSerialRun } from './serial';
import { buildMrpLabel, MrpLabel } from './mrp-label';

/**
 * Finished goods, serial numbers and quality control.
 *
 * On QC-passed completion of a production order this creates the production
 * batch, generates a unique serial and FinishedGood per unit, and posts the
 * finished-goods output to the inventory ledger. Serials are the traceability
 * spine linking batch → dispatch → invoice → warranty.
 */
@Injectable()
export class FinishedGoodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  // --- Quality control ------------------------------------------------------

  /** Move an order into QC and open a pending inspection. */
  async submitForQc(productionOrderId: string): Promise<unknown> {
    await this.requireOrder(productionOrderId);
    const inspection = await this.prisma.qcInspection.create({
      data: { productionOrderId, result: 'PENDING' },
    });
    await this.prisma.productionOrder.update({
      where: { id: productionOrderId },
      data: { status: 'QC_PENDING' },
    });
    return inspection;
  }

  /**
   * Record a QC result. FAIL/REWORK sends the order back to the floor; PASS
   * clears it for completion.
   */
  async recordQc(
    productionOrderId: string,
    result: 'PASS' | 'FAIL' | 'REWORK',
    notes?: string,
    userId?: string,
  ): Promise<unknown> {
    const inspection = await this.prisma.qcInspection.findFirst({
      where: { productionOrderId, result: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!inspection) {
      throw new BadRequestException(
        'No pending QC inspection; submit the order for QC first',
      );
    }
    const updated = await this.prisma.qcInspection.update({
      where: { id: inspection.id },
      data: {
        result,
        notes,
        inspectedById: userId,
        inspectedAt: new Date(),
      },
    });
    if (result !== 'PASS') {
      await this.prisma.productionOrder.update({
        where: { id: productionOrderId },
        data: { status: 'IN_PROGRESS' },
      });
    }
    return updated;
  }

  getQc(productionOrderId: string) {
    return this.prisma.qcInspection.findMany({
      where: { productionOrderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- Completion: batch, serials, finished goods ---------------------------

  /**
   * Complete a QC-passed order: create the batch, one serial + FinishedGood per
   * unit, and post the finished-goods output to the ledger.
   */
  async complete(
    productionOrderId: string,
    warehouseId: string,
    userId?: string,
  ): Promise<{
    batchId: string;
    batchCode: string;
    serials: string[];
    warehouseId: string;
  }> {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id: productionOrderId },
      include: {
        qcInspections: true,
        template: {
          include: {
            variant: { include: { model: { include: { brand: true } } } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Production order not found');
    if (order.status === 'COMPLETED') {
      throw new BadRequestException('Order is already completed');
    }
    const passed = (order.qcInspections as Array<{ result: string }>).some(
      (q) => q.result === 'PASS',
    );
    if (!passed) {
      throw new BadRequestException('QC has not passed for this order');
    }

    const variant = order.template.variant;
    const brandCode = variant.model.brand.code;
    const modelCode = variant.model.code;
    const quantity = order.quantity;
    const now = new Date();

    const priorCount = await this.prisma.serialNumber.count();
    const serials = buildSerialRun(
      brandCode,
      modelCode,
      now,
      priorCount + 1,
      quantity,
    );

    const result = await this.prisma.$transaction(async (tx: PrismaService) => {
      const batch = await tx.batch.create({
        data: {
          code: `BATCH-${Date.now()}`,
          productionOrderId,
          manufacturedOn: now,
        },
      });

      for (const serial of serials) {
        const fg = await tx.finishedGood.create({
          data: {
            variantId: variant.id,
            productionOrderId,
            warehouseId,
          },
        });
        await tx.serialNumber.create({
          data: {
            serial,
            variantId: variant.id,
            batchId: batch.id,
            productionOrderId,
            finishedGoodId: fg.id,
          },
        });
      }

      await tx.productionOrder.update({
        where: { id: productionOrderId },
        data: { status: 'COMPLETED', completedAt: now },
      });

      return batch;
    });

    // Post the finished-goods output to the ledger (own transaction).
    await this.inventory.postMovement({
      movementType: 'PRODUCTION_OUTPUT',
      inventoryType: 'FINISHED_GOOD',
      materialId: null,
      warehouseId,
      batchId: result.id,
      quantity,
      refType: 'PRODUCTION_ORDER',
      refId: productionOrderId,
      note: `Finished goods for ${order.orderNumber}`,
      userId,
    });

    return {
      batchId: result.id,
      batchCode: result.code,
      serials,
      warehouseId,
    };
  }

  // --- Lookups --------------------------------------------------------------

  listFinishedGoods(variantId?: string) {
    return this.prisma.finishedGood.findMany({
      where: { variantId },
      include: { variant: true, serialNumbers: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Full traceability for one serial. */
  async getSerial(serial: string): Promise<Record<string, unknown>> {
    const sn = await this.prisma.serialNumber.findUnique({
      where: { serial },
      include: {
        batch: true,
        warranty: true,
        finishedGood: {
          include: {
            productionOrder: true,
            variant: { include: { model: { include: { brand: true } } } },
          },
        },
      },
    });
    if (!sn) throw new NotFoundException(`Serial ${serial} not found`);
    return sn as Record<string, unknown>;
  }

  /** Build the MRP label payload for a serial. */
  async label(serial: string): Promise<MrpLabel> {
    const sn = (await this.getSerial(serial)) as Record<string, unknown>;
    const fg = sn.finishedGood as Record<string, unknown> | null;
    if (!fg) throw new BadRequestException('Serial has no finished good');
    const variant = fg.variant as Record<string, unknown>;
    const model = variant.model as Record<string, unknown>;
    const brand = model.brand as Record<string, unknown>;
    const po = fg.productionOrder as Record<string, unknown> | null;

    let warrantyMonths: number | undefined;
    if (model.warrantyPolicyId) {
      const policy = await this.prisma.warrantyPolicy.findUnique({
        where: { id: model.warrantyPolicyId as string },
      });
      warrantyMonths = policy ? Number(policy.durationMonths) : undefined;
    }

    return buildMrpLabel({
      serial,
      brandName: brand.name as string,
      modelName: model.name as string,
      variantName: variant.name as string,
      length: Number(po?.length ?? variant.defaultLength ?? 0),
      width: Number(po?.width ?? variant.defaultWidth ?? 0),
      height: Number(po?.height ?? variant.defaultHeight ?? 0),
      manufacturedOn: (sn.createdAt as Date) ?? new Date(),
      warrantyMonths,
    });
  }

  private async requireOrder(id: string): Promise<void> {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id },
    });
    if (!order) throw new NotFoundException('Production order not found');
  }
}
