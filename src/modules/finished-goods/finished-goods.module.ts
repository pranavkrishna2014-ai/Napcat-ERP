import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { FinishedGoodsService } from './finished-goods.service';
import {
  FinishedGoodsController,
  QcController,
  SerialsController,
} from './finished-goods.controller';

/**
 * Phase 4 — finished goods, serial numbers and QC. Depends on the inventory
 * ledger to post finished-goods output. Completion is gated on a QC pass.
 */
@Module({
  imports: [InventoryModule],
  controllers: [QcController, FinishedGoodsController, SerialsController],
  providers: [FinishedGoodsService],
  exports: [FinishedGoodsService],
})
export class FinishedGoodsModule {}
