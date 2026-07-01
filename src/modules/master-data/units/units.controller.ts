import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { BaseCrudController } from '../../../common/crud/base-crud.controller';
import { ColumnSpec, ExcelService } from '../../../common/excel/excel.service';
import { Audit } from '../../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../../auth/decorators/roles.decorator';
import { UnitsService } from './units.service';

class CreateUnitDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @Type(() => Number) @IsNumber() baseFactor?: number;
}
class UpdateUnitDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() baseFactor?: number;
}

const UNIT_COLUMNS: ColumnSpec[] = [
  { field: 'code', aliases: ['Code', 'UOM', 'Unit'], required: true },
  { field: 'name', aliases: ['Name', 'Unit Name'], required: true },
  { field: 'baseFactor', aliases: ['Base Factor', 'Factor'], type: 'number' },
];

@Controller('units')
@Audit('UnitOfMeasure')
export class UnitsController extends BaseCrudController {
  constructor(service: UnitsService, excel: ExcelService) {
    super(service, excel, UNIT_COLUMNS);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  create(@Body() dto: CreateUnitDto) {
    return this.service.create({ ...dto });
  }

  @Patch(':id')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  update(@Param('id') id: string, @Body() dto: UpdateUnitDto) {
    return this.service.update(id, { ...dto });
  }
}
