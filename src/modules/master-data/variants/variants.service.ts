import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { CrudService, PrismaDelegate } from '../../../common/crud/crud.service';

@Injectable()
export class VariantsService extends CrudService {
  constructor(prisma: PrismaService) {
    super(prisma.modelVariant as unknown as PrismaDelegate, {
      searchFields: ['code', 'name'],
      defaultOrderBy: { name: 'asc' },
      include: { model: true },
      softDelete: true,
      label: 'Model variant',
    });
  }
}
