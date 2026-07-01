import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { BaseCrudController } from '../../../common/crud/base-crud.controller';
import { ColumnSpec, ExcelService } from '../../../common/excel/excel.service';
import { Audit } from '../../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../../auth/decorators/roles.decorator';
import { ModelsService } from './models.service';

class CreateModelDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsUUID() brandId!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() warrantyPolicyId?: string;
}
class UpdateModelDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUUID() brandId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() warrantyPolicyId?: string;
}

// FK-based import: brandId required as an id. Prefer creating via the API.
const MODEL_COLUMNS: ColumnSpec[] = [
  { field: 'code', aliases: ['Code', 'Model Code'], required: true },
  { field: 'name', aliases: ['Name', 'Model Name'], required: true },
  { field: 'brandId', aliases: ['Brand Id', 'BrandId'], required: true },
  { field: 'description', aliases: ['Description'] },
];

@Controller('models')
@Audit('MattressModel')
export class ModelsController extends BaseCrudController {
  constructor(service: ModelsService, excel: ExcelService) {
    super(service, excel, MODEL_COLUMNS);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  create(@Body() dto: CreateModelDto) {
    return this.service.create({ ...dto });
  }

  @Patch(':id')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  update(@Param('id') id: string, @Body() dto: UpdateModelDto) {
    return this.service.update(id, { ...dto });
  }
}
