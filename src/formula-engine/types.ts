/**
 * Shared types for the Formula Engine.
 *
 * The engine replaces the factory's Excel spreadsheets. It never stores fixed
 * material quantities; instead each mattress layer carries a formula string
 * that is evaluated dynamically whenever a production order is created.
 */

/** A map of variable name -> numeric value fed into a formula. */
export type FormulaScope = Record<string, number>;

/** Definition of a single material layer, as stored on a ProductionTemplate. */
export interface LayerDefinition {
  /** Stable identifier (TemplateLayer.id) for traceability. */
  id: string;
  sequence: number;
  materialId: string;
  /** Human-facing material name, for readable requirement output. */
  materialName?: string;
  uomCode?: string;
  /** Expression, e.g. "LENGTH * WIDTH * THICKNESS / 1728". */
  formula: string;
  /**
   * Optional fixed thickness (inches). When present it is exposed to later
   * layers as `LAYER{sequence}_THICKNESS` so height-remainder formulas work,
   * and as the local variable `THICKNESS` within this layer's own formula.
   */
  fixedThickness?: number | null;
  /** Wastage fraction, 0.05 = +5%. */
  wastageRate?: number;
  /** Tolerance fraction for variance exceptions, 0.01 = +/-1%. */
  toleranceRate?: number;
  isContingentEligible?: boolean;
}

/** A production template as consumed by the engine. */
export interface TemplateDefinition {
  id: string;
  version: number;
  overallHeight?: number | null;
  layers: LayerDefinition[];
  /** Named constants/defaults declared on the template. */
  variables?: FormulaScope;
}

/** Per-unit result of evaluating one layer. */
export interface LayerResult {
  layerId: string;
  sequence: number;
  materialId: string;
  materialName?: string;
  uomCode?: string;
  formula: string;
  /** Raw formula result before wastage, per single mattress. */
  baseQtyPerUnit: number;
  wastageRate: number;
  toleranceRate: number;
  /** baseQtyPerUnit * (1 + wastageRate). */
  qtyPerUnitWithWastage: number;
  isContingentEligible: boolean;
}

/** Aggregated requirement for a full production order. */
export interface RequirementResult {
  templateId: string;
  templateVersion: number;
  orderQuantity: number;
  scope: FormulaScope;
  layers: LayerResult[];
  /** Consolidated per-material totals across all layers for the whole order. */
  materialTotals: MaterialTotal[];
}

export interface MaterialTotal {
  materialId: string;
  materialName?: string;
  uomCode?: string;
  baseQtyPerUnit: number;
  qtyPerUnitWithWastage: number;
  /** qtyPerUnitWithWastage * orderQuantity. */
  standardQty: number;
  /** Effective tolerance (max across contributing layers). */
  toleranceRate: number;
}

export class FormulaError extends Error {
  constructor(
    message: string,
    public readonly formula?: string,
  ) {
    super(message);
    this.name = 'FormulaError';
  }
}
