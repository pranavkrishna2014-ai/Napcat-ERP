import { Module } from '@nestjs/common';
import { WarrantyModule } from '../warranty/warranty.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { ReportingService } from './reporting.service';
import { ReportingController } from './reporting.controller';

/** Phase 7 — exceptions-first management dashboards. */
@Module({
  imports: [WarrantyModule, DispatchModule],
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
