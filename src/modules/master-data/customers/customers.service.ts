import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { CrudService, PrismaDelegate } from '../../../common/crud/crud.service';

@Injectable()
export class CustomersService extends CrudService {
  constructor(prisma: PrismaService) {
    super(prisma.customer as unknown as PrismaDelegate, {
      searchFields: ['name', 'phone', 'email'],
      defaultOrderBy: { name: 'asc' },
      softDelete: false,
      label: 'Customer',
    });
  }
}
