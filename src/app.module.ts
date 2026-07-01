import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './common/prisma.module';
import { AuditModule } from './common/audit/audit.module';
import { AuditInterceptor } from './common/audit/audit.interceptor';
import { ExcelModule } from './common/excel/excel.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { FormulaEngineModule } from './formula-engine/formula-engine.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { InventoryModule } from './modules/inventory/inventory.module';

/**
 * Root module. Cross-cutting concerns are registered globally:
 *   - JwtAuthGuard: authenticates every request (opt out with @Public()).
 *   - RolesGuard: enforces @Roles() after authentication.
 *   - AuditInterceptor: records every successful mutation to the audit log.
 *
 * Feature modules (Inventory, Production, Dispatch, Warranty, ...) register
 * here as they are built, each adhering to the ERP's core principles.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    ExcelModule,
    AuthModule,
    FormulaEngineModule,
    MasterDataModule,
    InventoryModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
