import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { BaseCrudController } from '../../../common/crud/base-crud.controller';
import { ColumnSpec, ExcelService } from '../../../common/excel/excel.service';
import { Audit } from '../../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../../auth/decorators/roles.decorator';
import { VariantsService } from './variants.service';

class CreateVariantDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsUUID() modelId!: string;
  @IsOptional() @Type(() => Number) @IsNumber() defaultLength?: number;
  @IsOptional() @Type(() => Number) @IsNumber() defaultWidth?: number;
  @IsOptional() @Type(() => Number) @IsNumber() defaultHeight?: number;
}
class UpdateVariantDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUUID() modelId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() defaultLength?: number;
  @IsOptional() @Type(() => Number) @IsNumber() defaultWidth?: number;
  @IsOptional() @Type(() => Number) @IsNumber() defaultHeight?: number;
}

const VARIANT_COLUMNS: ColumnSpec[] = [
  { field: 'code', aliases: ['Code', 'Variant Code'], required: true },
  { field: 'name', aliases: ['Name', 'Variant Name'], required: true },
  { field: 'modelId', aliases: ['Model Id', 'ModelId'], required: true },
  { field: 'defaultLength', aliases: ['Length', 'Default Length'], type: 'number' },
  { field: 'defaultWidth', aliases: ['Width', 'Breadth', 'Default Width'], type: 'number' },
  { field: 'defaultHeight', aliases: ['Height', 'Default Height'], type: 'number' },
];

@Controller('variants')
@Audit('ModelVariant')
export class VariantsController extends BaseCrudController {
  constructor(service: VariantsService, excel: ExcelService) {
    super(service, excel, VARIANT_COLUMNS);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  create(@Body() dto: CreateVariantDto) {
    return this.service.create({ ...dto });
  }

  @Patch(':id')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  update(@Param('id') id: string, @Body() dto: UpdateVariantDto) {
    return this.service.update(id, { ...dto });
  }
}
