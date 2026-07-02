import {
  FormulaScope,
  LayerDefinition,
  TemplateDefinition,
} from '../../formula-engine';

/**
 * Shape of a ProductionTemplate loaded from the database (with layers and
 * variables). Numeric columns may arrive as Prisma Decimal, so they are
 * coerced with Number() here.
 */
export interface TemplateRow {
  id: string;
  version: number;
  overallHeight?: number | string | null;
  variables?: Array<{ key: string; defaultValue?: number | string | null }>;
  layers: Array<{
    id: string;
    sequence: number;
    materialId: string;
    material?: { name?: string } | null;
    uom?: { code?: string } | null;
    layerKey?: string | null;
    thicknessFormula?: string | null;
    usageFormula: string;
    wastageRate?: number | string | null;
    toleranceRate?: number | string | null;
    isContingentEligible?: boolean | null;
  }>;
}

function num(v: number | string | null | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Map a database ProductionTemplate into the framework-free TemplateDefinition
 * consumed by the Formula Engine. This is the seam between persistence and the
 * pure calculation core.
 */
export function toTemplateDefinition(row: TemplateRow): TemplateDefinition {
  const variables: FormulaScope = {};
  for (const v of row.variables ?? []) {
    const dv = num(v.defaultValue);
    if (dv !== undefined) variables[v.key.toUpperCase()] = dv;
  }

  const layers: LayerDefinition[] = (row.layers ?? []).map((l) => ({
    id: l.id,
    sequence: l.sequence,
    materialId: l.materialId,
    materialName: l.material?.name,
    uomCode: l.uom?.code,
    layerKey: l.layerKey ?? undefined,
    thicknessFormula: l.thicknessFormula ?? null,
    usageFormula: l.usageFormula,
    wastageRate: num(l.wastageRate),
    toleranceRate: num(l.toleranceRate),
    isContingentEligible: l.isContingentEligible ?? false,
  }));

  return {
    id: row.id,
    version: row.version,
    overallHeight: num(row.overallHeight) ?? null,
    variables,
    layers,
  };
}
