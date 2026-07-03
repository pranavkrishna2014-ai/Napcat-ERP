import { Controller, Get, Query } from '@nestjs/common';
import { ReportingService } from './reporting.service';

/**
 * Management dashboards (Phase 7). Read-only; any authenticated user. Each route
 * surfaces exceptions rather than raw data.
 */
@Controller('dashboard')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('summary')
  summary() {
    return this.reporting.summary();
  }

  @Get('variance-exceptions')
  variance() {
    return this.reporting.varianceExceptions();
  }

  @Get('low-stock')
  lowStock() {
    return this.reporting.lowStock();
  }

  @Get('pending-qc')
  pendingQc() {
    return this.reporting.pendingQc();
  }

  @Get('contingent')
  contingent() {
    return this.reporting.contingentBalances();
  }

  @Get('warranty-expiring')
  warrantyExpiring(@Query('days') days?: string) {
    return this.reporting.warrantyExpiring(days ? Number(days) : 90);
  }

  @Get('open-claims')
  openClaims() {
    return this.reporting.openClaims();
  }

  @Get('dispatch-reconciliation')
  reconciliation() {
    return this.reporting.dispatchReconciliation();
  }
}
