import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Audit } from '../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../auth/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../auth/decorators/current-user.decorator';
import { SalesOrderService } from './sales-orders.service';

class SalesOrderLineDto {
  @IsUUID() variantId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsOptional() @Type(() => Number) @IsNumber() length?: number;
  @IsOptional() @Type(() => Number) @IsNumber() width?: number;
  @IsOptional() @Type(() => Number) @IsNumber() height?: number;
}
class CreateSalesOrderDto {
  @IsOptional() @IsUUID() dealerId?: string;
  @IsOptional() @IsString() note?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SalesOrderLineDto)
  lines!: SalesOrderLineDto[];
}

@Controller('sales-orders')
@Audit('SalesOrder')
export class SalesOrdersController {
  constructor(private readonly salesOrders: SalesOrderService) {}

  @Post()
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  create(@Body() dto: CreateSalesOrderDto) {
    return this.salesOrders.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.salesOrders.get(id);
  }

  @Post(':id/submit')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  submit(@Param('id') id: string) {
    return this.salesOrders.submit(id);
  }

  /** Approve and auto-generate production orders (Formula Engine driven). */
  @Post(':id/approve')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.salesOrders.approve(id, user?.id);
  }

  @Post(':id/reject')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  reject(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.salesOrders.reject(id, user?.id);
  }
}
