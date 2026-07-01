import { Module } from '@nestjs/common';
import { FormulaEngineService } from './formula-engine.service';

/**
 * The Formula Engine is a self-contained, dependency-free calculation module so
 * it can be reused by Production, Planning and Reporting without coupling to the
 * database. Feed it plain template definitions (loaded from Prisma elsewhere).
 */
@Module({
  providers: [FormulaEngineService],
  exports: [FormulaEngineService],
})
export class FormulaEngineModule {}
