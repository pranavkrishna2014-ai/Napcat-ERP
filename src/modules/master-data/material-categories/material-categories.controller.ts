import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { BaseCrudController } from '../../../common/crud/base-crud.controller';
import { ColumnSpec, ExcelService } from '../../../common/excel/excel.service';
import { Audit } from '../../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../../auth/decorators/roles.decorator';
import { MaterialCategoriesService } from './material-categories.service';

class CreateCategoryDto {
  @IsString() @MinLength(1) name!: string;
}
class UpdateCategoryDto {
  @IsOptional() @IsString() name?: string;
}

const CATEGORY_COLUMNS: ColumnSpec[] = [
  { field: 'name', aliases: ['Name', 'Category', 'Category Name'], required: true },
];

@Controller('material-categories')
@Audit('MaterialCategory')
export class MaterialCategoriesController extends BaseCrudController {
  constructor(service: MaterialCategoriesService, excel: ExcelService) {
    super(service, excel, CATEGORY_COLUMNS);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  create(@Body() dto: CreateCategoryDto) {
    return this.service.create({ ...dto });
  }

  @Patch(':id')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.update(id, { ...dto });
  }
}
