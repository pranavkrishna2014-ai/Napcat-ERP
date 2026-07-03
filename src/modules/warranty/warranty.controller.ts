import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Audit } from '../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../auth/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../auth/decorators/current-user.decorator';
import { WarrantyService } from './warranty.service';

class FileClaimDto {
  @IsString() @MinLength(1) serial!: string;
  @IsOptional() @IsUUID() dealerId?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsString() @MinLength(3) reason!: string;
}
class DecideClaimDto {
  @IsIn(['APPROVED', 'REJECTED', 'REPLACED']) decision!:
    | 'APPROVED'
    | 'REJECTED'
    | 'REPLACED';
  @IsOptional() @IsString() replacementSerial?: string;
}

@Controller('warranties')
@Audit('Warranty')
export class WarrantyController {
  constructor(private readonly warranty: WarrantyService) {}

  /** Active warranties expiring within `days` (default 90). */
  @Get('expiring')
  expiring(@Query('days') days?: string) {
    return this.warranty.listExpiring(days ? Number(days) : 90);
  }

  @Get(':serial')
  bySerial(@Param('serial') serial: string) {
    return this.warranty.getBySerial(serial);
  }
}

@Controller('warranty-claims')
@Audit('WarrantyClaim')
export class ClaimsController {
  constructor(private readonly warranty: WarrantyService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.warranty.listClaims(status);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  file(@Body() dto: FileClaimDto) {
    return this.warranty.fileClaim(dto);
  }

  @Post(':id/decide')
  @Roles(AppRole.ADMIN)
  decide(
    @Param('id') id: string,
    @Body() dto: DecideClaimDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.warranty.decideClaim(
      id,
      dto.decision,
      dto.replacementSerial,
      user?.id,
    );
  }
}
