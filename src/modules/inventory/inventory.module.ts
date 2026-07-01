import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

/**
 * Inventory core (Phase 2): the append-only ledger, derived balances,
 * receipts / issues / returns / transfers / scrap, the contingent lifecycle,
 * authorized adjustments, and ledger reconciliation. InventoryService is
 * exported so Production and Dispatch can post movements through the same
 * single choke point.
 */
@Module({
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
