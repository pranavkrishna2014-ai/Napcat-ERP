import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Audit } from '../../common/audit/audit.decorator';
import { AppRole, Roles } from '../../auth/decorators/roles.decorator';
import { TemplatesService } from './templates.service';

class TemplateVariableDto {
  @IsString() key!: string;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @Type(() => Number) @IsNumber() defaultValue?: number;
}
class TemplateLayerDto {
  @IsInt() @Min(1) sequence!: number;
  @IsUUID() materialId!: string;
  @IsUUID() uomId!: string;
  @IsOptional() @IsString() layerKey?: string;
  @IsOptional() @IsString() thicknessFormula?: string | null;
  @IsString() usageFormula!: string;
  @IsOptional() @Type(() => Number) @IsNumber() wastageRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() toleranceRate?: number;
  @IsOptional() @IsBoolean() isContingentEligible?: boolean;
}
class CreateTemplateDto {
  @IsUUID() variantId!: string;
  @IsOptional() @Type(() => Number) @IsNumber() overallHeight?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => TemplateVariableDto)
  variables?: TemplateVariableDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => TemplateLayerDto)
  layers!: TemplateLayerDto[];
}
class PreviewDto {
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  /** Formula inputs, e.g. { LENGTH: 75, WIDTH: 60, HEIGHT: 6 }. */
  inputs!: Record<string, number>;
}

@Controller('production-templates')
@Audit('ProductionTemplate')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@Query('variantId') variantId: string) {
    return this.templates.listByVariant(variantId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.templates.get(id);
  }

  @Post()
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  create(@Body() dto: CreateTemplateDto) {
    return this.templates.create(dto);
  }

  @Post(':id/activate')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  activate(@Param('id') id: string) {
    return this.templates.activate(id);
  }

  /** Dry-run the Formula Engine against this template (no persistence). */
  @Post(':id/preview')
  @Roles(AppRole.ADMIN, AppRole.PLANNER)
  preview(@Param('id') id: string, @Body() dto: PreviewDto) {
    return this.templates.compute(id, dto.inputs, dto.quantity);
  }
}
