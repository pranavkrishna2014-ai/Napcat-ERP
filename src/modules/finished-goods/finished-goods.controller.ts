import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { Audit } from '../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../auth/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../auth/decorators/current-user.decorator';
import { FinishedGoodsService } from './finished-goods.service';

class RecordQcDto {
  @IsIn(['PASS', 'FAIL', 'REWORK']) result!: 'PASS' | 'FAIL' | 'REWORK';
  @IsOptional() @IsString() notes?: string;
}
class CompleteDto {
  @IsUUID() warehouseId!: string;
}

/** QC and completion, scoped to a production order. */
@Controller('production-orders')
@Audit('ProductionOrder')
export class QcController {
  constructor(private readonly fg: FinishedGoodsService) {}

  @Post(':id/qc/submit')
  @Roles(AppRole.ADMIN, AppRole.PLANNER, AppRole.QC)
  submit(@Param('id') id: string) {
    return this.fg.submitForQc(id);
  }

  @Post(':id/qc')
  @Roles(AppRole.ADMIN, AppRole.QC)
  record(
    @Param('id') id: string,
    @Body() dto: RecordQcDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.fg.recordQc(id, dto.result, dto.notes, user?.id);
  }

  @Get(':id/qc')
  history(@Param('id') id: string) {
    return this.fg.getQc(id);
  }

  /** Complete a QC-passed order: batch, serials, finished goods, ledger output. */
  @Post(':id/complete')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.fg.complete(id, dto.warehouseId, user?.id);
  }
}

@Controller('finished-goods')
export class FinishedGoodsController {
  constructor(private readonly fg: FinishedGoodsService) {}

  @Get()
  list(@Query('variantId') variantId?: string) {
    return this.fg.listFinishedGoods(variantId);
  }
}

/** Serial lookups and MRP label. */
@Controller('serials')
export class SerialsController {
  constructor(private readonly fg: FinishedGoodsService) {}

  @Get(':serial')
  get(@Param('serial') serial: string) {
    return this.fg.getSerial(serial);
  }

  @Get(':serial/label')
  label(@Param('serial') serial: string) {
    return this.fg.label(serial);
  }
}
