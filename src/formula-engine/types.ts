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
  /**
   * Stable variable name for this layer's thickness (e.g. "L1"). Other layers'
   * `thicknessFormula`s reference it by this name — mirroring the Excel sheets'
   * E-column row references (E4, E5, ...). Optional for layers whose thickness
   * is never referenced.
   */
  layerKey?: string;
  /**
   * The layer's thickness expression (Excel "USAGE"/E column). May be a
   * constant ("2"), the full height ("HEIGHT"), or a remainder that references
   * other layers by their `layerKey` ("HEIGHT - L1 - L2"). Resolved before
   * usage. `null` for fabrics / fixed-count layers that have no thickness.
   */
  thicknessFormula?: string | null;
  /**
   * Per-unit usage expression (Excel "PER UNIT"/G column). May reference
   * dimensions (LENGTH, WIDTH, HEIGHT, BORDER_WIDTH), this layer's resolved
   * `THICKNESS`, and any layer's thickness by `layerKey`.
   * e.g. "LENGTH * WIDTH * THICKNESS / 1728".
   */
  usageFormula: string;
  /** Wastage fraction, 0.05 = +5%. Defaults to 0 (Excel applies none). */
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
  /** The usage formula that was evaluated (kept for traceability/audit). */
  formula: string;
  /** Resolved thickness for this layer, or null if it has none. */
  resolvedThickness: number | null;
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
