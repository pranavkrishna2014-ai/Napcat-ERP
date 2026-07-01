import { Injectable } from '@nestjs/common';
import { evaluateFormula } from './evaluator';
import {
  FormulaError,
  FormulaScope,
  LayerDefinition,
  LayerResult,
  MaterialTotal,
  RequirementResult,
  TemplateDefinition,
} from './types';

/**
 * The Formula Engine.
 *
 * Given a production template (a versioned set of material layers with
 * formulas) and the order dimensions/quantity, it computes the standard
 * material requirement dynamically — reproducing the factory's Excel math
 * without ever storing fixed consumption values.
 *
 * Layer-thickness chaining: each layer with a `fixedThickness` publishes two
 * variables usable by *later* layers' formulas:
 *   - LAYER{sequence}_THICKNESS   (e.g. LAYER1_THICKNESS)
 * and, within its own formula, the convenience alias `THICKNESS`.
 * This is what makes height-remainder formulas such as
 *   "LENGTH * WIDTH * (OVERALL_HEIGHT - LAYER1_THICKNESS - LAYER2_THICKNESS) / 1728"
 * work exactly as they do in the spreadsheets.
 */
@Injectable()
export class FormulaEngineService {
  /**
   * Compute the full requirement for a production order.
   *
   * @param template  Versioned production template with ordered layers.
   * @param inputs    Dimension/other variables (LENGTH, WIDTH, OVERALL_HEIGHT...).
   * @param orderQuantity Number of mattresses on the production order.
   */
  computeRequirement(
    template: TemplateDefinition,
    inputs: FormulaScope,
    orderQuantity: number,
  ): RequirementResult {
    if (!Number.isInteger(orderQuantity) || orderQuantity <= 0) {
      throw new FormulaError(
        `Order quantity must be a positive integer, got ${orderQuantity}`,
      );
    }

    // Base scope: template constants first, then caller inputs (inputs win),
    // then derived values we inject below.
    const scope: FormulaScope = {
      ...(template.variables ?? {}),
      ...normalizeKeys(inputs),
    };

    if (template.overallHeight != null && scope.OVERALL_HEIGHT == null) {
      scope.OVERALL_HEIGHT = template.overallHeight;
    }

    const layers = [...template.layers].sort((a, b) => a.sequence - b.sequence);
    const layerResults: LayerResult[] = [];

    for (const layer of layers) {
      const result = this.evaluateLayer(layer, scope);
      layerResults.push(result);

      // Publish this layer's thickness to subsequent layers.
      if (layer.fixedThickness != null) {
        scope[`LAYER${layer.sequence}_THICKNESS`] = layer.fixedThickness;
      }
    }

    const materialTotals = this.consolidate(layerResults, orderQuantity);

    return {
      templateId: template.id,
      templateVersion: template.version,
      orderQuantity,
      scope,
      layers: layerResults,
      materialTotals,
    };
  }

  private evaluateLayer(
    layer: LayerDefinition,
    scope: FormulaScope,
  ): LayerResult {
    // Expose the layer's own fixed thickness as `THICKNESS` inside its formula.
    const layerScope: FormulaScope = { ...scope };
    if (layer.fixedThickness != null) {
      layerScope.THICKNESS = layer.fixedThickness;
    }

    let baseQtyPerUnit: number;
    try {
      baseQtyPerUnit = evaluateFormula(layer.formula, layerScope);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new FormulaError(
        `Layer ${layer.sequence} (${layer.materialName ?? layer.materialId}): ${detail}`,
        layer.formula,
      );
    }

    if (baseQtyPerUnit < 0) {
      throw new FormulaError(
        `Layer ${layer.sequence} produced a negative quantity (${baseQtyPerUnit}). ` +
          `Check thickness/height inputs.`,
        layer.formula,
      );
    }

    const wastageRate = layer.wastageRate ?? 0;
    const toleranceRate = layer.toleranceRate ?? 0.01;
    const qtyPerUnitWithWastage = baseQtyPerUnit * (1 + wastageRate);

    return {
      layerId: layer.id,
      sequence: layer.sequence,
      materialId: layer.materialId,
      materialName: layer.materialName,
      uomCode: layer.uomCode,
      formula: layer.formula,
      baseQtyPerUnit: round6(baseQtyPerUnit),
      wastageRate,
      toleranceRate,
      qtyPerUnitWithWastage: round6(qtyPerUnitWithWastage),
      isContingentEligible: layer.isContingentEligible ?? false,
    };
  }

  /**
   * A single material may appear in more than one layer; consolidate to a
   * per-material total for the whole order. Tolerance is the max across the
   * contributing layers (most permissive), matching shop-floor practice.
   */
  private consolidate(
    layers: LayerResult[],
    orderQuantity: number,
  ): MaterialTotal[] {
    const byMaterial = new Map<string, MaterialTotal>();

    for (const layer of layers) {
      const existing = byMaterial.get(layer.materialId);
      if (existing) {
        existing.baseQtyPerUnit = round6(
          existing.baseQtyPerUnit + layer.baseQtyPerUnit,
        );
        existing.qtyPerUnitWithWastage = round6(
          existing.qtyPerUnitWithWastage + layer.qtyPerUnitWithWastage,
        );
        existing.standardQty = round6(
          existing.qtyPerUnitWithWastage * orderQuantity,
        );
        existing.toleranceRate = Math.max(
          existing.toleranceRate,
          layer.toleranceRate,
        );
      } else {
        byMaterial.set(layer.materialId, {
          materialId: layer.materialId,
          materialName: layer.materialName,
          uomCode: layer.uomCode,
          baseQtyPerUnit: layer.baseQtyPerUnit,
          qtyPerUnitWithWastage: layer.qtyPerUnitWithWastage,
          standardQty: round6(layer.qtyPerUnitWithWastage * orderQuantity),
          toleranceRate: layer.toleranceRate,
        });
      }
    }

    return [...byMaterial.values()].sort((a, b) =>
      (a.materialName ?? a.materialId).localeCompare(
        b.materialName ?? b.materialId,
      ),
    );
  }
}

/**
 * Compute production variance for a material: standard vs actual.
 * Returns the signed variance, its percentage, and whether it breaches
 * tolerance (an EXCEPTION) or is WITHIN_TOLERANCE.
 */
export function computeVariance(
  standardQty: number,
  actualQty: number,
  toleranceRate: number,
): {
  varianceQty: number;
  variancePct: number;
  status: 'WITHIN_TOLERANCE' | 'EXCEPTION';
} {
  const varianceQty = round6(actualQty - standardQty);
  const variancePct =
    standardQty === 0
      ? actualQty === 0
        ? 0
        : 100
      : round6((varianceQty / standardQty) * 100);
  const status =
    Math.abs(variancePct) > toleranceRate * 100
      ? 'EXCEPTION'
      : 'WITHIN_TOLERANCE';
  return { varianceQty, variancePct, status };
}

function normalizeKeys(scope: FormulaScope): FormulaScope {
  const out: FormulaScope = {};
  for (const [k, v] of Object.entries(scope)) {
    out[k.toUpperCase()] = v;
  }
  return out;
}

/** Round to 6 decimal places to avoid binary-float noise in quantities. */
function round6(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}
