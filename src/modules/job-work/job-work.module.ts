import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { JobWorkService } from './job-work.service';
import { JobWorkController } from './job-work.controller';

/** Phase 4 — foam cutting & quilting job-work, tracked through the ledger. */
@Module({
  imports: [InventoryModule],
  controllers: [JobWorkController],
  providers: [JobWorkService],
  exports: [JobWorkService],
})
export class JobWorkModule {}
