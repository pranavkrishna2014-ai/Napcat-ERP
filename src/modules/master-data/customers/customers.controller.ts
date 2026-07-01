import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { BaseCrudController } from '../../../common/crud/base-crud.controller';
import { ColumnSpec, ExcelService } from '../../../common/excel/excel.service';
import { Audit } from '../../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../../auth/decorators/roles.decorator';
import { CustomersService } from './customers.service';

class CreateCustomerDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
}
class UpdateCustomerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
}

const CUSTOMER_COLUMNS: ColumnSpec[] = [
  { field: 'name', aliases: ['Name', 'Customer Name'], required: true },
  { field: 'phone', aliases: ['Phone', 'Mobile', 'Contact'] },
  { field: 'email', aliases: ['Email'] },
  { field: 'address', aliases: ['Address'] },
];

@Controller('customers')
@Audit('Customer')
export class CustomersController extends BaseCrudController {
  constructor(service: CustomersService, excel: ExcelService) {
    super(service, excel, CUSTOMER_COLUMNS);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  create(@Body() dto: CreateCustomerDto) {
    return this.service.create({ ...dto });
  }

  @Patch(':id')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.service.update(id, { ...dto });
  }
}
