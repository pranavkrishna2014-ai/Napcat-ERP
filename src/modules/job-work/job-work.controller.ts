import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { Audit } from '../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../auth/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JobWorkService } from './job-work.service';

class CreateJobWorkDto {
  @IsIn(['FOAM_CUTTING', 'QUILTING']) type!: 'FOAM_CUTTING' | 'QUILTING';
  @IsOptional() @IsUUID() productionOrderId?: string;
  @IsUUID() materialId!: string;
  @IsUUID() warehouseId!: string;
  @Type(() => Number) @IsNumber() @IsPositive() issueQty!: number;
  @IsOptional() @IsString() vendor?: string;
  @IsOptional() @IsString() note?: string;
}
class ReceiveJobWorkDto {
  @IsOptional() @IsUUID() semiFinishedMaterialId?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @Type(() => Number) @IsNumber() @IsPositive() receivedQty!: number;
  @IsOptional() @Type(() => Number) @IsNumber() scrapQty?: number;
}

const JOB_ROLES = [AppRole.ADMIN, AppRole.PLANNER, AppRole.STORE, AppRole.OPERATOR];

@Controller('job-work')
@Audit('JobWork')
export class JobWorkController {
  constructor(private readonly jobWork: JobWorkService) {}

  @Get()
  list(
    @Query('productionOrderId') productionOrderId?: string,
    @Query('status') status?: string,
  ) {
    return this.jobWork.list({ productionOrderId, status });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.jobWork.get(id);
  }

  /** Issue material to a foam-cutting / quilting job. */
  @Post()
  @Roles(...JOB_ROLES)
  create(@Body() dto: CreateJobWorkDto, @CurrentUser() user: AuthUser) {
    return this.jobWork.create({ ...dto, userId: user?.id });
  }

  /** Receive the semi-finished component back (plus any scrap). */
  @Post(':id/receive')
  @Roles(...JOB_ROLES)
  receive(
    @Param('id') id: string,
    @Body() dto: ReceiveJobWorkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobWork.receive(id, { ...dto, userId: user?.id });
  }
}
