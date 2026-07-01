import { Injectable } from '@nestjs/common';
import { evaluateFormula, extractVariables } from './evaluator';
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
 * material requirement dynamically — reproducing the factory's Excel workbooks
 * without ever storing fixed consumption values.
 *
 * It mirrors the spreadsheet exactly with a two-phase evaluation, matching the
 * Data-sheet columns:
 *
 *   Phase 1 — Thickness (Excel "USAGE" / E column):
 *     Each layer's `thicknessFormula` is resolved. It may be a constant, the
 *     full HEIGHT, or a remainder that references *other* layers' thickness by
 *     their `layerKey` (e.g. "HEIGHT - L1 - L6"). References may point to
 *     layers listed later, so resolution is dependency-ordered (iterative
 *     fixpoint), exactly as Excel resolves inter-cell references.
 *
 *   Phase 2 — Usage per unit (Excel "PER UNIT" / G column):
 *     Each layer's `usageFormula` is evaluated with the dimensions, this
 *     layer's resolved `THICKNESS`, and every layer's thickness by `layerKey`.
 *
 *   Final usage (Excel "Final Usage" / H column) = per-unit * order quantity,
 *   with optional wastage applied on top (Excel applies none by default).
 */
@Injectable()
export class FormulaEngineService {
  /**
   * Compute the full requirement for a production order.
   *
   * @param template  Versioned production template with ordered layers.
   * @param inputs    Dimension/other variables: LENGTH, WIDTH, HEIGHT,
   *                  BORDER_WIDTH, ... (upper-cased internally).
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

    // Base scope: template constants first, then caller inputs (inputs win).
    const scope: FormulaScope = {
      ...(template.variables ?? {}),
      ...normalizeKeys(inputs),
    };
    if (template.overallHeight != null && scope.HEIGHT == null) {
      scope.HEIGHT = template.overallHeight;
    }

    const layers = [...template.layers].sort((a, b) => a.sequence - b.sequence);

    // --- Phase 1: resolve every layer's thickness -----------------------------
    const thicknesses = this.resolveThicknesses(layers, scope);
    for (const [key, value] of Object.entries(thicknesses)) {
      scope[key] = value;
    }

    // --- Phase 2: evaluate per-unit usage for each layer ----------------------
    const layerResults: LayerResult[] = layers.map((layer) =>
      this.evaluateUsage(layer, scope, thicknesses),
    );

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

  /**
   * Resolve each layer's thickness, honouring cross-layer references in any
   * order via an iterative fixpoint. Returns a map of `layerKey` -> thickness.
   * Layers without a `thicknessFormula` contribute nothing.
   */
  private resolveThicknesses(
    layers: LayerDefinition[],
    scope: FormulaScope,
  ): Record<string, number> {
    const layerKeys = new Set(
      layers.map((l) => l.layerKey).filter((k): k is string => !!k),
    );

    const resolved: Record<string, number> = {};
    const pending = layers.filter((l) => l.thicknessFormula != null);

    let progress = true;
    while (pending.length > 0 && progress) {
      progress = false;

      for (let i = pending.length - 1; i >= 0; i--) {
        const layer = pending[i];
        const formula = layer.thicknessFormula as string;

        // Only evaluate once every referenced *layer* dependency is known.
        const deps = extractVariables(formula).filter((v) => layerKeys.has(v));
        const ready = deps.every((d) => d in resolved);
        if (!ready) continue;

        let value: number;
        try {
          value = evaluateFormula(formula, { ...scope, ...resolved });
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          throw new FormulaError(
            `Layer ${layer.sequence} (${layer.materialName ?? layer.materialId}) thickness: ${detail}`,
            formula,
          );
        }

        if (value < 0) {
          throw new FormulaError(
            `Layer ${layer.sequence} (${layer.materialName ?? layer.materialId}) ` +
              `resolved to a negative thickness (${value}). Check HEIGHT and layer thicknesses.`,
            formula,
          );
        }

        if (layer.layerKey) {
          resolved[layer.layerKey] = value;
        } else {
          // No key: still record under a private handle so evaluateUsage can
          // find THICKNESS; use the layer id to avoid clashes.
          resolved[`__seq${layer.sequence}`] = value;
        }
        pending.splice(i, 1);
        progress = true;
      }
    }

    if (pending.length > 0) {
      const names = pending
        .map((l) => `${l.layerKey ?? 'L' + l.sequence}`)
        .join(', ');
      throw new FormulaError(
        `Could not resolve layer thicknesses (unresolvable or circular reference): ${names}`,
      );
    }

    return resolved;
  }

  private evaluateUsage(
    layer: LayerDefinition,
    scope: FormulaScope,
    thicknesses: Record<string, number>,
  ): LayerResult {
    let resolvedThickness: number | null = null;
    if (layer.thicknessFormula != null) {
      resolvedThickness = layer.layerKey
        ? thicknesses[layer.layerKey]
        : thicknesses[`__seq${layer.sequence}`];
    }

    const usageScope: FormulaScope = { ...scope };
    if (resolvedThickness != null) {
      usageScope.THICKNESS = resolvedThickness;
    }

    let baseQtyPerUnit: number;
    try {
      baseQtyPerUnit = evaluateFormula(layer.usageFormula, usageScope);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new FormulaError(
        `Layer ${layer.sequence} (${layer.materialName ?? layer.materialId}) usage: ${detail}`,
        layer.usageFormula,
      );
    }

    if (baseQtyPerUnit < 0) {
      throw new FormulaError(
        `Layer ${layer.sequence} produced a negative quantity (${baseQtyPerUnit}).`,
        layer.usageFormula,
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
      formula: layer.usageFormula,
      resolvedThickness:
        resolvedThickness == null ? null : round6(resolvedThickness),
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
