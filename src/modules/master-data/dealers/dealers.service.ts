import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { CrudService, PrismaDelegate } from '../../../common/crud/crud.service';

@Injectable()
export class DealersService extends CrudService {
  constructor(prisma: PrismaService) {
    super(prisma.dealer as unknown as PrismaDelegate, {
      searchFields: ['code', 'name', 'region'],
      defaultOrderBy: { name: 'asc' },
      softDelete: true,
      label: 'Dealer',
    });
  }
}
