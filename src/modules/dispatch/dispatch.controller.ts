import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Audit } from '../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../auth/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../auth/decorators/current-user.decorator';
import { DispatchService } from './dispatch.service';
import { TallyService } from './tally.service';

class DispatchLineDto {
  @IsOptional() @IsUUID() variantId?: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) serials!: string[];
}
class CreateDispatchDto {
  @IsOptional() @IsUUID() dealerId?: string;
  @IsOptional() @IsDateString() plannedDate?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DispatchLineDto)
  lines!: DispatchLineDto[];
}
class DoDispatchDto {
  @IsUUID() warehouseId!: string;
}
class ImportInvoiceDto {
  @IsString() invoiceNumber!: string;
  @IsDateString() invoiceDate!: string;
  @IsOptional() @IsUUID() dealerId?: string;
  @IsOptional() @IsString() customerName?: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) serials!: string[];
}

const DISPATCH_ROLES = [AppRole.ADMIN, AppRole.PLANNER, AppRole.STORE];

@Controller('dispatch')
@Audit('DispatchPlan')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  // Declared before :id so it isn't captured as an id.
  @Get('reconcile')
  reconcile() {
    return this.dispatch.reconcile();
  }

  @Get()
  list(@Query('status') status?: string) {
    return this.dispatch.list(status);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.dispatch.get(id);
  }

  @Post()
  @Roles(...DISPATCH_ROLES)
  create(@Body() dto: CreateDispatchDto, @CurrentUser() user: AuthUser) {
    return this.dispatch.createPlan({
      dealerId: dto.dealerId,
      plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : undefined,
      lines: dto.lines,
      userId: user?.id,
    });
  }

  @Post(':id/dispatch')
  @Roles(...DISPATCH_ROLES)
  doDispatch(
    @Param('id') id: string,
    @Body() dto: DoDispatchDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dispatch.dispatch(id, dto.warehouseId, user?.id);
  }
}

@Controller('tally')
@Audit('TallyInvoice')
export class TallyController {
  constructor(private readonly tally: TallyService) {}

  /** Import a Tally invoice (activates warranties). Accounting stays in Tally. */
  @Post('invoices')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  importInvoice(@Body() dto: ImportInvoiceDto) {
    return this.tally.importInvoice({
      invoiceNumber: dto.invoiceNumber,
      invoiceDate: new Date(dto.invoiceDate),
      dealerId: dto.dealerId,
      customerName: dto.customerName,
      serials: dto.serials,
    });
  }
}
