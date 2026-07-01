import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { CrudService, PrismaDelegate } from '../../../common/crud/crud.service';

export interface MaterialImportRow {
  code: string;
  name: string;
  category: string;
  uom: string;
  density?: number | null;
  isContingentEligible?: boolean;
  reorderLevel?: number | null;
}

@Injectable()
export class MaterialsService extends CrudService {
  constructor(private readonly prisma: PrismaService) {
    super(prisma.material as unknown as PrismaDelegate, {
      searchFields: ['code', 'name'],
      defaultOrderBy: { name: 'asc' },
      include: { category: true, uom: true },
      softDelete: true,
      label: 'Material',
    });
  }

  /**
   * Bulk import materials from a sheet that references category by name and
   * unit by code (operator-friendly), resolving them to foreign keys.
   */
  async importRows(rows: MaterialImportRow[]): Promise<{ created: number }> {
    const [cats, uoms] = await Promise.all([
      this.prisma.materialCategory.findMany(),
      this.prisma.unitOfMeasure.findMany(),
    ]);
    const catByName = new Map(
      cats.map((c) => [c.name.trim().toLowerCase(), c.id]),
    );
    const uomByCode = new Map(
      uoms.map((u) => [u.code.trim().toLowerCase(), u.id]),
    );

    let created = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNo = i + 2;
      const categoryId = catByName.get(String(row.category).trim().toLowerCase());
      if (!categoryId) {
        throw new BadRequestException(
          `Row ${rowNo}: unknown material category "${row.category}"`,
        );
      }
      const uomId = uomByCode.get(String(row.uom).trim().toLowerCase());
      if (!uomId) {
        throw new BadRequestException(
          `Row ${rowNo}: unknown unit of measure "${row.uom}"`,
        );
      }
      await this.prisma.material.create({
        data: {
          code: row.code,
          name: row.name,
          categoryId,
          uomId,
          density: row.density ?? null,
          isContingentEligible: row.isContingentEligible ?? false,
          reorderLevel: row.reorderLevel ?? null,
        },
      });
      created++;
    }
    return { created };
  }
}
