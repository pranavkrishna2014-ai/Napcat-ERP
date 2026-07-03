import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

export interface CreateJobWorkInput {
  type: 'FOAM_CUTTING' | 'QUILTING';
  productionOrderId?: string;
  materialId: string;
  warehouseId: string;
  issueQty: number;
  vendor?: string;
  note?: string;
  userId?: string;
}

export interface ReceiveJobWorkInput {
  /** Semi-finished component received; defaults to the input material. */
  semiFinishedMaterialId?: string;
  warehouseId?: string;
  receivedQty: number;
  scrapQty?: number;
  userId?: string;
}

/**
 * Foam cutting and quilting job-work. Issuing consumes raw material from the
 * ledger; receiving posts the semi-finished component back and any offcut to
 * scrap. Both legs are ordinary, traceable inventory movements.
 */
@Injectable()
export class JobWorkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async create(input: CreateJobWorkInput): Promise<unknown> {
    const job = await this.prisma.jobWork.create({
      data: {
        reference: `JW-${Date.now()}`,
        type: input.type,
        status: 'ISSUED',
        productionOrderId: input.productionOrderId,
        materialId: input.materialId,
        warehouseId: input.warehouseId,
        issuedQty: input.issueQty,
        vendor: input.vendor,
        note: input.note,
        createdById: input.userId,
      },
    });

    // Issue the raw material to the job through the inventory ledger.
    await this.inventory.issue({
      materialId: input.materialId,
      warehouseId: input.warehouseId,
      inventoryType: 'RAW_MATERIAL',
      quantity: input.issueQty,
      refType: 'JOB_WORK',
      refId: job.id,
      note: `${input.type} issue`,
      userId: input.userId,
    });

    return job;
  }

  /**
   * Receive the finished component back into semi-finished inventory; post any
   * offcut to scrap. Idempotency guard: a job can only be received once.
   */
  async receive(id: string, input: ReceiveJobWorkInput): Promise<unknown> {
    const job = await this.prisma.jobWork.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job work not found');
    if (job.status === 'RECEIVED') {
      throw new BadRequestException('Job work has already been received');
    }
    if (!(input.receivedQty > 0)) {
      throw new BadRequestException('Received quantity must be positive');
    }

    const warehouseId = input.warehouseId ?? job.warehouseId;
    const materialId = input.semiFinishedMaterialId ?? job.materialId ?? undefined;

    await this.inventory.postMovement({
      movementType: 'PRODUCTION_OUTPUT',
      inventoryType: 'SEMI_FINISHED',
      materialId,
      warehouseId,
      quantity: input.receivedQty,
      refType: 'JOB_WORK',
      refId: id,
      note: `${job.type} received`,
      userId: input.userId,
    });

    if (input.scrapQty && input.scrapQty > 0 && materialId) {
      await this.inventory.scrap({
        materialId,
        warehouseId,
        quantity: input.scrapQty,
        refType: 'JOB_WORK',
        refId: id,
        userId: input.userId,
      });
    }

    return this.prisma.jobWork.update({
      where: { id },
      data: {
        status: 'RECEIVED',
        receivedQty: input.receivedQty,
        scrapQty: input.scrapQty ?? 0,
        receivedAt: new Date(),
      },
    });
  }

  get(id: string) {
    return this.prisma.jobWork.findUnique({ where: { id } });
  }

  list(filter: { productionOrderId?: string; status?: string }) {
    return this.prisma.jobWork.findMany({
      where: {
        productionOrderId: filter.productionOrderId,
        status: filter.status as never,
      },
      orderBy: { issuedAt: 'desc' },
      take: 200,
    });
  }
}
