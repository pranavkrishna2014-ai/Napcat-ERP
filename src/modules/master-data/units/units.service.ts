import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { CrudService, PrismaDelegate } from '../../../common/crud/crud.service';

@Injectable()
export class UnitsService extends CrudService {
  constructor(prisma: PrismaService) {
    super(prisma.unitOfMeasure as unknown as PrismaDelegate, {
      searchFields: ['code', 'name'],
      defaultOrderBy: { code: 'asc' },
      softDelete: false,
      label: 'Unit of measure',
    });
  }
}
