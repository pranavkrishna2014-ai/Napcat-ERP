import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { CrudService, PrismaDelegate } from '../../../common/crud/crud.service';

@Injectable()
export class ModelsService extends CrudService {
  constructor(prisma: PrismaService) {
    super(prisma.mattressModel as unknown as PrismaDelegate, {
      searchFields: ['code', 'name'],
      defaultOrderBy: { name: 'asc' },
      include: { brand: true, variants: true },
      softDelete: true,
      label: 'Mattress model',
    });
  }
}
