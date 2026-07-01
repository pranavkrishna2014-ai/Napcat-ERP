import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import {
  IsBoolean,
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
import { MaterialImportRow, MaterialsService } from './materials.service';

class CreateMaterialDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsUUID() categoryId!: string;
  @IsUUID() uomId!: string;
  @IsOptional() @IsString() inventoryType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() density?: number;
  @IsOptional() @IsBoolean() isContingentEligible?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() reorderLevel?: number;
}
class UpdateMaterialDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() uomId?: string;
  @IsOptional() @IsString() inventoryType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() density?: number;
  @IsOptional() @IsBoolean() isContingentEligible?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() reorderLevel?: number;
}

const MATERIAL_COLUMNS: ColumnSpec[] = [
  { field: 'code', aliases: ['Code', 'Material Code'], required: true },
  { field: 'name', aliases: ['Name', 'Material Name', 'Product'], required: true },
  { field: 'category', aliases: ['Category', 'Material Category'], required: true },
  { field: 'uom', aliases: ['UOM', 'Unit', 'Metric'], required: true },
  { field: 'density', aliases: ['Density'], type: 'number' },
  { field: 'isContingentEligible', aliases: ['Contingent', 'Contingent Eligible'], type: 'boolean' },
  { field: 'reorderLevel', aliases: ['Reorder Level', 'Reorder'], type: 'number' },
];

@Controller('materials')
@Audit('Material')
export class MaterialsController extends BaseCrudController {
  constructor(
    private readonly materials: MaterialsService,
    excel: ExcelService,
  ) {
    super(materials, excel, MATERIAL_COLUMNS);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  create(@Body() dto: CreateMaterialDto) {
    return this.service.create({ ...dto });
  }

  @Patch(':id')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  update(@Param('id') id: string, @Body() dto: UpdateMaterialDto) {
    return this.service.update(id, { ...dto });
  }

  /** Override the generic import to resolve category/uom names to FKs. */
  @Post('import')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  @UseInterceptors(FileInterceptor('file'))
  import(@UploadedFile() file?: { buffer: Buffer }) {
    if (!file?.buffer) {
      throw new BadRequestException('An Excel file ("file" field) is required');
    }
    const rows = this.excel.mapRows<MaterialImportRow>(
      this.excel.parseBuffer(file.buffer),
      this.importColumns,
    );
    return this.materials.importRows(rows);
  }
}
