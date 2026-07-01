import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export const INVENTORY_TYPES = [
  'RAW_MATERIAL',
  'SEMI_FINISHED',
  'FINISHED_GOOD',
  'CONTINGENT',
  'SCRAP',
] as const;

/** A stock movement targeting a specific material/warehouse/(batch). */
export class MovementDto {
  @IsUUID() materialId!: string;
  @IsUUID() warehouseId!: string;
  @IsOptional() @IsUUID() batchId?: string;
  @IsIn(INVENTORY_TYPES) inventoryType!: string;
  @Type(() => Number) @IsNumber() @IsPositive() quantity!: number;
  @IsOptional() @IsString() refType?: string;
  @IsOptional() @IsString() refId?: string;
  @IsOptional() @IsString() note?: string;
}

export class ReceiptDto extends MovementDto {
  @IsOptional() opening?: boolean;
}

/** Scrap / contingent movements default their inventory type in the service. */
export class SimpleMovementDto {
  @IsUUID() materialId!: string;
  @IsUUID() warehouseId!: string;
  @IsOptional() @IsUUID() batchId?: string;
  @Type(() => Number) @IsNumber() @IsPositive() quantity!: number;
  @IsOptional() @IsString() note?: string;
}

export class TransferDto {
  @IsUUID() materialId!: string;
  @IsIn(INVENTORY_TYPES) inventoryType!: string;
  @IsOptional() @IsUUID() batchId?: string;
  @IsUUID() sourceWarehouseId!: string;
  @IsUUID() destinationWarehouseId!: string;
  @Type(() => Number) @IsNumber() @IsPositive() quantity!: number;
  @IsOptional() @IsString() note?: string;
}

export class AdjustmentDto {
  @IsUUID() materialId!: string;
  @IsUUID() warehouseId!: string;
  @IsOptional() @IsUUID() batchId?: string;
  @IsIn(INVENTORY_TYPES) inventoryType!: string;
  /** Signed: positive increases, negative decreases. */
  @Type(() => Number) @IsNumber() delta!: number;
  @IsString() @MinLength(3) reason!: string;
}

export class BalanceQueryDto {
  @IsOptional() @IsUUID() materialId?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsIn(INVENTORY_TYPES) inventoryType?: string;
}

export class LedgerQueryDto extends BalanceQueryDto {
  @IsOptional() @IsString() refType?: string;
  @IsOptional() @IsString() refId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() pageSize?: number;
}
