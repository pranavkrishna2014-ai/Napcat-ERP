import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { BaseCrudController } from '../../../common/crud/base-crud.controller';
import { ColumnSpec, ExcelService } from '../../../common/excel/excel.service';
import { Audit } from '../../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../../auth/decorators/roles.decorator';
import { BrandsService } from './brands.service';

class CreateBrandDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class UpdateBrandDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

const BRAND_COLUMNS: ColumnSpec[] = [
  { field: 'code', aliases: ['Code', 'Brand Code'], required: true },
  { field: 'name', aliases: ['Name', 'Brand Name'], required: true },
];

@Controller('brands')
@Audit('Brand')
export class BrandsController extends BaseCrudController {
  constructor(service: BrandsService, excel: ExcelService) {
    super(service, excel, BRAND_COLUMNS);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  create(@Body() dto: CreateBrandDto) {
    return this.service.create({ ...dto });
  }

  @Patch(':id')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  update(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.service.update(id, { ...dto });
  }
}
