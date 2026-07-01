import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { CrudService, PrismaDelegate } from '../../../common/crud/crud.service';

@Injectable()
export class MaterialCategoriesService extends CrudService {
  constructor(prisma: PrismaService) {
    super(prisma.materialCategory as unknown as PrismaDelegate, {
      searchFields: ['name'],
      defaultOrderBy: { name: 'asc' },
      softDelete: false,
      label: 'Material category',
    });
  }
}
