import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { TemplatesService } from './templates.service';
import { ProductionService } from './production.service';

export interface CreateSalesOrderInput {
  dealerId?: string;
  requiredDate?: Date;
  note?: string;
  lines: Array<{
    variantId: string;
    quantity: number;
    length?: number;
    width?: number;
    height?: number;
  }>;
}

/**
 * Sales orders drive production. On approval, each line automatically spawns a
 * production order via the variant's ACTIVE production template, whose material
 * requirement is computed by the Formula Engine — no manual data entry.
 */
@Injectable()
export class SalesOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
    private readonly production: ProductionService,
  ) {}

  async create(input: CreateSalesOrderInput): Promise<unknown> {
    if (!input.lines?.length) {
      throw new BadRequestException('A sales order needs at least one line');
    }
    return this.prisma.salesOrder.create({
      data: {
        orderNumber: `SO-${Date.now()}`,
        dealerId: input.dealerId,
        requiredDate: input.requiredDate,
        note: input.note,
        status: 'DRAFT',
        lines: {
          create: input.lines.map((l) => ({
            variantId: l.variantId,
            quantity: l.quantity,
            length: l.length,
            width: l.width,
            height: l.height,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async get(id: string): Promise<Record<string, unknown>> {
    const so = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: { lines: { include: { variant: true } }, productionOrders: true },
    });
    if (!so) throw new NotFoundException('Sales order not found');
    return so as Record<string, unknown>;
  }

  async submit(id: string): Promise<unknown> {
    const so = await this.get(id);
    if (so.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT orders can be submitted');
    }
    return this.prisma.salesOrder.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL' },
    });
  }

  async reject(id: string, userId?: string): Promise<unknown> {
    await this.get(id);
    return this.prisma.salesOrder.update({
      where: { id },
      data: { status: 'REJECTED', approvedById: userId, approvedAt: new Date() },
    });
  }

  /**
   * Approve the order and generate a production order per line using each
   * variant's ACTIVE template and dimensions (line overrides, else variant
   * defaults). Returns the created production orders.
   */
  async approve(id: string, userId?: string): Promise<unknown> {
    const so = await this.get(id);
    if (so.status !== 'PENDING_APPROVAL' && so.status !== 'DRAFT') {
      throw new BadRequestException(
        'Only DRAFT or PENDING_APPROVAL orders can be approved',
      );
    }
    const lines = (so.lines as Array<Record<string, unknown>>) ?? [];

    const created: unknown[] = [];
    for (const line of lines) {
      const variant = line.variant as {
        defaultLength?: number | string | null;
        defaultWidth?: number | string | null;
        defaultHeight?: number | string | null;
      };
      const template = await this.templates.getActiveForVariant(
        line.variantId as string,
      );
      if (!template) {
        throw new BadRequestException(
          `No ACTIVE production template for variant ${line.variantId as string}`,
        );
      }

      const length = numOr(line.length, variant.defaultLength);
      const width = numOr(line.width, variant.defaultWidth);
      const height = numOr(line.height, variant.defaultHeight);
      if (length == null || width == null || height == null) {
        throw new BadRequestException(
          `Line for variant ${line.variantId as string} is missing dimensions ` +
            `(no line values and no variant defaults)`,
        );
      }

      const po = await this.production.createOrder({
        templateId: template.id,
        salesOrderId: id,
        salesOrderLineId: line.id as string,
        quantity: Number(line.quantity),
        length,
        width,
        height,
        userId,
      });
      created.push(po);
    }

    await this.prisma.salesOrder.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() },
    });

    return { salesOrderId: id, productionOrders: created };
  }
}

function numOr(
  primary: unknown,
  fallback: number | string | null | undefined,
): number | null {
  const p = primary == null ? null : Number(primary);
  if (p != null && Number.isFinite(p)) return p;
  const f = fallback == null ? null : Number(fallback);
  return f != null && Number.isFinite(f) ? f : null;
}
