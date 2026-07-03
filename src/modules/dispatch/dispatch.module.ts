import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { WarrantyModule } from '../warranty/warranty.module';
import { DispatchService } from './dispatch.service';
import { TallyService } from './tally.service';
import { DispatchController, TallyController } from './dispatch.controller';

/**
 * Phase 5 — dispatch & Tally sync. Dispatch issues finished goods through the
 * ledger; the Tally import activates warranties (via WarrantyModule) and feeds
 * dispatch reconciliation.
 */
@Module({
  imports: [InventoryModule, WarrantyModule],
  controllers: [DispatchController, TallyController],
  providers: [DispatchService, TallyService],
  exports: [DispatchService, TallyService],
})
export class DispatchModule {}
