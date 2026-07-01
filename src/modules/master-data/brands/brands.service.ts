import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { CrudService, PrismaDelegate } from '../../../common/crud/crud.service';

@Injectable()
export class BrandsService extends CrudService {
  constructor(prisma: PrismaService) {
    super(prisma.brand as unknown as PrismaDelegate, {
      searchFields: ['code', 'name'],
      defaultOrderBy: { name: 'asc' },
      softDelete: true,
      label: 'Brand',
    });
  }
}
