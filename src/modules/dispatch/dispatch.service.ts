import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { reconcileDispatch, ReconResult } from './reconciliation';

/**
 * Dispatch planning. Dispatching a plan issues each finished-good serial out of
 * FINISHED_GOOD inventory through the ledger and links the serial to its
 * dispatch line, so it can later be reconciled against the Tally invoice.
 */
@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async createPlan(input: {
    dealerId?: string;
    plannedDate?: Date;
    lines: Array<{ variantId?: string; serials: string[] }>;
    userId?: string;
  }): Promise<unknown> {
    if (!input.lines?.length) {
      throw new BadRequestException('A dispatch plan needs at least one line');
    }
    const plan = await this.prisma.dispatchPlan.create({
      data: {
        reference: `DSP-${Date.now()}`,
        dealerId: input.dealerId,
        plannedDate: input.plannedDate,
        status: 'PLANNED',
        createdById: input.userId,
        lines: {
          create: input.lines.map((l) => ({
            variantId: l.variantId,
            quantity: l.serials.length,
          })),
        },
      },
      include: { lines: true },
    });

    // Link each serial to its dispatch line.
    const lines = plan.lines as Array<{ id: string }>;
    for (let i = 0; i < input.lines.length; i++) {
      const serials = input.lines[i].serials;
      if (serials.length) {
        await this.prisma.serialNumber.updateMany({
          where: { serial: { in: serials } },
          data: { dispatchLineId: lines[i].id },
        });
      }
    }
    return this.get(plan.id);
  }

  async get(id: string): Promise<Record<string, unknown>> {
    const plan = await this.prisma.dispatchPlan.findUnique({
      where: { id },
      include: { lines: { include: { serialNumbers: true } } },
    });
    if (!plan) throw new NotFoundException('Dispatch plan not found');
    return plan as Record<string, unknown>;
  }

  /** Dispatch the plan: issue every serial out of finished-goods inventory. */
  async dispatch(
    id: string,
    warehouseId: string,
    userId?: string,
  ): Promise<unknown> {
    const plan = await this.get(id);
    if (plan.status === 'DISPATCHED') {
      throw new BadRequestException('Plan is already dispatched');
    }
    const lines = (plan.lines as Array<Record<string, unknown>>) ?? [];

    for (const line of lines) {
      const serials = (line.serialNumbers as Array<Record<string, unknown>>) ?? [];
      for (const sn of serials) {
        await this.inventory.postMovement({
          movementType: 'DISPATCH_ISSUE',
          inventoryType: 'FINISHED_GOOD',
          materialId: null,
          warehouseId,
          batchId: (sn.batchId as string) ?? null,
          serialNumberId: sn.id as string,
          quantity: 1,
          refType: 'DISPATCH_PLAN',
          refId: id,
          userId,
        });
      }
    }

    return this.prisma.dispatchPlan.update({
      where: { id },
      data: { status: 'DISPATCHED', dispatchedAt: new Date() },
    });
  }

  list(status?: string) {
    return this.prisma.dispatchPlan.findMany({
      where: { status: status as never },
      orderBy: { createdAt: 'desc' },
      include: { lines: true },
      take: 200,
    });
  }

  /** Reconcile all dispatched serials against all Tally-invoiced serials. */
  async reconcile(): Promise<ReconResult> {
    const [dispatched, invoiced] = await Promise.all([
      this.prisma.serialNumber.findMany({
        where: { dispatchLineId: { not: null } },
        select: { serial: true },
      }),
      this.prisma.tallyInvoiceLine.findMany({ select: { serial: true } }),
    ]);
    return reconcileDispatch(
      (dispatched as Array<{ serial: string }>).map((s) => s.serial),
      (invoiced as Array<{ serial: string }>).map((s) => s.serial),
    );
  }
}
