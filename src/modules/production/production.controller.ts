import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Audit } from '../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../auth/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ProductionService } from './production.service';

class CreateProductionOrderDto {
  @IsUUID() templateId!: string;
  @IsOptional() @IsUUID() salesOrderId?: string;
  @IsOptional() @IsUUID() salesOrderLineId?: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @Type(() => Number) @IsNumber() @IsPositive() length!: number;
  @Type(() => Number) @IsNumber() @IsPositive() width!: number;
  @Type(() => Number) @IsNumber() @IsPositive() height!: number;
  @IsOptional() @Type(() => Number) @IsNumber() borderWidth?: number;
}

class IssueLineDto {
  @IsUUID() materialId!: string;
  @IsUUID() warehouseId!: string;
  @IsOptional() @IsUUID() batchId?: string;
  @Type(() => Number) @IsNumber() @IsPositive() quantity!: number;
}
class IssueDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => IssueLineDto)
  lines!: IssueLineDto[];
}

class ConsumptionLineDto {
  @IsUUID() materialId!: string;
  @Type(() => Number) @IsNumber() actualQty!: number;
  @IsOptional() @Type(() => Number) @IsNumber() contingentRecoveredQty?: number;
  @IsOptional() @Type(() => Number) @IsNumber() scrapQty?: number;
  @IsOptional() @IsUUID() warehouseId?: string;
}
class ConsumptionDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ConsumptionLineDto)
  lines!: ConsumptionLineDto[];
}

const STOCK_ROLES = [AppRole.ADMIN, AppRole.PLANNER, AppRole.STORE];

@Controller('production-orders')
@Audit('ProductionOrder')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Post()
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  create(@Body() dto: CreateProductionOrderDto) {
    return this.production.createOrder(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.production.getOrder(id);
  }

  @Get(':id/availability')
  availability(@Param('id') id: string) {
    return this.production.checkAvailability(id);
  }

  @Post(':id/reserve')
  @Roles(...STOCK_ROLES)
  reserve(@Param('id') id: string) {
    return this.production.reserve(id);
  }

  @Post(':id/issue')
  @Roles(...STOCK_ROLES)
  issue(
    @Param('id') id: string,
    @Body() dto: IssueDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.production.issue(id, dto.lines, user?.id);
  }

  @Post(':id/consumption')
  @Roles(AppRole.ADMIN, AppRole.PLANNER, AppRole.OPERATOR)
  consumption(
    @Param('id') id: string,
    @Body() dto: ConsumptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.production.recordConsumption(id, dto.lines, user?.id);
  }

  @Get(':id/variances')
  variances(@Param('id') id: string) {
    return this.production.getVariances(id);
  }
}
