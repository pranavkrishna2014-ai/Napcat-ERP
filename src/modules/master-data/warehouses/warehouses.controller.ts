import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { BaseCrudController } from '../../../common/crud/base-crud.controller';
import { ColumnSpec, ExcelService } from '../../../common/excel/excel.service';
import { Audit } from '../../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../../auth/decorators/roles.decorator';
import { WarehousesService } from './warehouses.service';

class CreateWarehouseDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() location?: string;
}
class UpdateWarehouseDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() location?: string;
}

const WAREHOUSE_COLUMNS: ColumnSpec[] = [
  { field: 'code', aliases: ['Code', 'Warehouse Code'], required: true },
  { field: 'name', aliases: ['Name', 'Warehouse Name'], required: true },
  { field: 'location', aliases: ['Location'] },
];

@Controller('warehouses')
@Audit('Warehouse')
export class WarehousesController extends BaseCrudController {
  constructor(service: WarehousesService, excel: ExcelService) {
    super(service, excel, WAREHOUSE_COLUMNS);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  create(@Body() dto: CreateWarehouseDto) {
    return this.service.create({ ...dto });
  }

  @Patch(':id')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.service.update(id, { ...dto });
  }
}
