import { Module } from '@nestjs/common';
import { PrismaService } from './common/prisma.service';
import { FormulaEngineModule } from './formula-engine/formula-engine.module';

/**
 * Root module. Feature modules (Inventory, Production, Warranty, Dispatch, ...)
 * will be registered here as they are built, each adhering to the ERP's core
 * principles: formula-driven manufacturing, an append-only inventory ledger,
 * end-to-end serial traceability, and a full audit trail.
 */
@Module({
  imports: [FormulaEngineModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
