import { Module } from '@nestjs/common';
import { BrandsController } from './brands/brands.controller';
import { BrandsService } from './brands/brands.service';
import { UnitsController } from './units/units.controller';
import { UnitsService } from './units/units.service';
import { MaterialCategoriesController } from './material-categories/material-categories.controller';
import { MaterialCategoriesService } from './material-categories/material-categories.service';
import { MaterialsController } from './materials/materials.controller';
import { MaterialsService } from './materials/materials.service';
import { ModelsController } from './models/models.controller';
import { ModelsService } from './models/models.service';
import { VariantsController } from './variants/variants.controller';
import { VariantsService } from './variants/variants.service';
import { WarehousesController } from './warehouses/warehouses.controller';
import { WarehousesService } from './warehouses/warehouses.service';
import { DealersController } from './dealers/dealers.controller';
import { DealersService } from './dealers/dealers.service';
import { CustomersController } from './customers/customers.controller';
import { CustomersService } from './customers/customers.service';

/**
 * Master data (Phase 1): CRUD + list/search/paginate + bulk Excel import for
 * every core reference entity. PrismaModule, ExcelModule and AuditModule are
 * global, so only controllers/services are registered here.
 */
@Module({
  controllers: [
    BrandsController,
    UnitsController,
    MaterialCategoriesController,
    MaterialsController,
    ModelsController,
    VariantsController,
    WarehousesController,
    DealersController,
    CustomersController,
  ],
  providers: [
    BrandsService,
    UnitsService,
    MaterialCategoriesService,
    MaterialsService,
    ModelsService,
    VariantsService,
    WarehousesService,
    DealersService,
    CustomersService,
  ],
})
export class MasterDataModule {}
