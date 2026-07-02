import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  FormulaEngineService,
  FormulaScope,
  RequirementResult,
} from '../../formula-engine';
import { toTemplateDefinition, TemplateRow } from './template-mapper';

const TEMPLATE_INCLUDE = {
  variables: true,
  layers: {
    include: { material: true, uom: true },
    orderBy: { sequence: 'asc' as const },
  },
};

export interface CreateTemplateInput {
  variantId: string;
  overallHeight?: number;
  variables?: Array<{ key: string; label?: string; defaultValue?: number }>;
  layers: Array<{
    sequence: number;
    materialId: string;
    uomId: string;
    layerKey?: string;
    thicknessFormula?: string | null;
    usageFormula: string;
    wastageRate?: number;
    toleranceRate?: number;
    isContingentEligible?: boolean;
  }>;
}

/**
 * Manages versioned, formula-driven production templates and runs them through
 * the Formula Engine. New versions are created as DRAFT; activating one archives
 * the previously active version for the same variant, so history is preserved.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: FormulaEngineService,
  ) {}

  /** Create the next DRAFT version for a variant. */
  async create(input: CreateTemplateInput): Promise<unknown> {
    if (!input.layers?.length) {
      throw new BadRequestException('A template needs at least one layer');
    }
    const last = await this.prisma.productionTemplate.findFirst({
      where: { variantId: input.variantId },
      orderBy: { version: 'desc' },
    });
    const version = (last?.version ?? 0) + 1;

    return this.prisma.productionTemplate.create({
      data: {
        variantId: input.variantId,
        version,
        status: 'DRAFT',
        overallHeight: input.overallHeight,
        variables: {
          create: (input.variables ?? []).map((v) => ({
            key: v.key.toUpperCase(),
            label: v.label ?? v.key,
            defaultValue: v.defaultValue,
          })),
        },
        layers: { create: input.layers },
      },
      include: TEMPLATE_INCLUDE,
    });
  }

  async get(id: string): Promise<TemplateRow> {
    const tpl = await this.prisma.productionTemplate.findUnique({
      where: { id },
      include: TEMPLATE_INCLUDE,
    });
    if (!tpl) throw new NotFoundException('Production template not found');
    return tpl as unknown as TemplateRow;
  }

  listByVariant(variantId: string) {
    return this.prisma.productionTemplate.findMany({
      where: { variantId },
      orderBy: { version: 'desc' },
      include: TEMPLATE_INCLUDE,
    });
  }

  /** Activate a version; archive any other ACTIVE version of the same variant. */
  async activate(id: string): Promise<unknown> {
    const tpl = await this.prisma.productionTemplate.findUnique({
      where: { id },
    });
    if (!tpl) throw new NotFoundException('Production template not found');

    return this.prisma.$transaction(async (tx: PrismaService) => {
      await tx.productionTemplate.updateMany({
        where: {
          variantId: tpl.variantId,
          status: 'ACTIVE',
          id: { not: id },
        },
        data: { status: 'ARCHIVED' },
      });
      return tx.productionTemplate.update({
        where: { id },
        data: { status: 'ACTIVE', activatedAt: new Date() },
      });
    });
  }

  /** The single ACTIVE template for a variant, or null. */
  async getActiveForVariant(variantId: string): Promise<TemplateRow | null> {
    const tpl = await this.prisma.productionTemplate.findFirst({
      where: { variantId, status: 'ACTIVE' },
      include: TEMPLATE_INCLUDE,
    });
    return (tpl as unknown as TemplateRow) ?? null;
  }

  /** Run a template through the Formula Engine (preview or persistence). */
  async compute(
    id: string,
    inputs: FormulaScope,
    quantity: number,
  ): Promise<RequirementResult> {
    const tpl = await this.get(id);
    return this.engine.computeRequirement(
      toTemplateDefinition(tpl),
      inputs,
      quantity,
    );
  }
}
