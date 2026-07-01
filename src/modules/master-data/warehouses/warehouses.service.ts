import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { CrudService, PrismaDelegate } from '../../../common/crud/crud.service';

@Injectable()
export class WarehousesService extends CrudService {
  constructor(prisma: PrismaService) {
    super(prisma.warehouse as unknown as PrismaDelegate, {
      searchFields: ['code', 'name', 'location'],
      defaultOrderBy: { name: 'asc' },
      softDelete: true,
      label: 'Warehouse',
    });
  }
}
