import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Audit } from '../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../auth/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../auth/decorators/current-user.decorator';
import { InventoryService } from './inventory.service';
import {
  AdjustmentDto,
  BalanceQueryDto,
  LedgerQueryDto,
  MovementDto,
  ReceiptDto,
  SimpleMovementDto,
  TransferDto,
} from './dto/inventory.dto';

/** Roles allowed to move stock. Adjustments are ADMIN-only (authorized). */
const STOCK_ROLES = [AppRole.ADMIN, AppRole.PLANNER, AppRole.STORE];

@Controller('inventory')
@Audit('Inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  // --- Reads (any authenticated user) --------------------------------------

  @Get('balances')
  balances(@Query() query: BalanceQueryDto) {
    return this.inventory.balances(query);
  }

  /** Barcode/QR-ready lookup by material code. */
  @Get('balances/by-code/:code')
  byCode(@Param('code') code: string) {
    return this.inventory.balancesByMaterialCode(code);
  }

  @Get('ledger')
  ledger(@Query() query: LedgerQueryDto) {
    return this.inventory.ledger(query);
  }

  @Get('reconcile')
  @Roles(AppRole.ADMIN)
  reconcile() {
    return this.inventory.reconcileAll();
  }

  // --- Movements -----------------------------------------------------------

  @Post('receipts')
  @Roles(...STOCK_ROLES)
  receipt(@Body() dto: ReceiptDto, @CurrentUser() user: AuthUser) {
    return this.inventory.receipt({ ...dto, userId: user?.id });
  }

  @Post('issues')
  @Roles(...STOCK_ROLES)
  issue(@Body() dto: MovementDto, @CurrentUser() user: AuthUser) {
    return this.inventory.issue({ ...dto, userId: user?.id });
  }

  @Post('returns')
  @Roles(...STOCK_ROLES)
  returnMaterial(@Body() dto: MovementDto, @CurrentUser() user: AuthUser) {
    return this.inventory.returnMaterial({ ...dto, userId: user?.id });
  }

  @Post('scrap')
  @Roles(...STOCK_ROLES)
  scrap(@Body() dto: SimpleMovementDto, @CurrentUser() user: AuthUser) {
    return this.inventory.scrap({ ...dto, userId: user?.id });
  }

  @Post('contingent/recover')
  @Roles(...STOCK_ROLES)
  contingentRecover(
    @Body() dto: SimpleMovementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventory.contingentRecover({ ...dto, userId: user?.id });
  }

  @Post('contingent/consume')
  @Roles(...STOCK_ROLES)
  contingentConsume(
    @Body() dto: SimpleMovementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventory.contingentConsume({ ...dto, userId: user?.id });
  }

  @Post('transfers')
  @Roles(...STOCK_ROLES)
  transfer(@Body() dto: TransferDto, @CurrentUser() user: AuthUser) {
    return this.inventory.transfer({ ...dto, userId: user?.id });
  }

  @Post('adjustments')
  @Roles(AppRole.ADMIN)
  adjust(@Body() dto: AdjustmentDto, @CurrentUser() user: AuthUser) {
    return this.inventory.adjust({ ...dto, userId: user?.id });
  }
}
