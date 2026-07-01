import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { BaseCrudController } from '../../../common/crud/base-crud.controller';
import { ColumnSpec, ExcelService } from '../../../common/excel/excel.service';
import { Audit } from '../../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../../auth/decorators/roles.decorator';
import { DealersService } from './dealers.service';

class CreateDealerDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() region?: string;
}
class UpdateDealerDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() region?: string;
}

const DEALER_COLUMNS: ColumnSpec[] = [
  { field: 'code', aliases: ['Code', 'Dealer Code'], required: true },
  { field: 'name', aliases: ['Name', 'Dealer Name'], required: true },
  { field: 'region', aliases: ['Region', 'City'] },
];

@Controller('dealers')
@Audit('Dealer')
export class DealersController extends BaseCrudController {
  constructor(service: DealersService, excel: ExcelService) {
    super(service, excel, DEALER_COLUMNS);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  create(@Body() dto: CreateDealerDto) {
    return this.service.create({ ...dto });
  }

  @Patch(':id')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  update(@Param('id') id: string, @Body() dto: UpdateDealerDto) {
    return this.service.update(id, { ...dto });
  }
}
