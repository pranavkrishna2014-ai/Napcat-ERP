import { Module } from '@nestjs/common';
import { WarrantyService } from './warranty.service';
import { WarrantyController, ClaimsController } from './warranty.controller';

/**
 * Phase 6 — warranty & claims. WarrantyService is exported so the Tally invoice
 * import (dispatch module) can activate warranties on sync.
 */
@Module({
  controllers: [WarrantyController, ClaimsController],
  providers: [WarrantyService],
  exports: [WarrantyService],
})
export class WarrantyModule {}
