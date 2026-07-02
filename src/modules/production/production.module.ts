import { Module } from '@nestjs/common';
import { FormulaEngineModule } from '../../formula-engine/formula-engine.module';
import { InventoryModule } from '../inventory/inventory.module';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { ProductionService } from './production.service';
import { ProductionController } from './production.controller';
import { SalesOrderService } from './sales-orders.service';
import { SalesOrdersController } from './sales-orders.controller';

/**
 * Phase 3 — formula-driven production. Ties the Formula Engine to the inventory
 * ledger: production templates (versioned), sales orders that auto-generate
 * production orders on approval, dynamic material requirement, availability
 * checks, reservation, issue, actual consumption and variance analysis.
 */
@Module({
  imports: [FormulaEngineModule, InventoryModule],
  controllers: [
    TemplatesController,
    ProductionController,
    SalesOrdersController,
  ],
  providers: [TemplatesService, ProductionService, SalesOrderService],
  exports: [TemplatesService, ProductionService],
})
export class ProductionModule {}
