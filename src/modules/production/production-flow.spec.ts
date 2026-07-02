import * as fs from 'fs';
import * as path from 'path';
import {
  computeVariance,
  FormulaEngineService,
  TemplateDefinition,
} from '../../formula-engine';
import { checkAvailability, RequirementLine } from './availability';

/**
 * Domain integration test (no database): drive the full production-planning
 * pipeline for a real catalogue model —
 *   Formula Engine → material requirement → availability check → variance —
 * proving the pieces Phase 3 orchestrates compose correctly.
 */
describe('production planning pipeline (Spinal Aligner)', () => {
  const engine = new FormulaEngineService();

  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../../../prisma/data/model-catalog.json'),
      'utf8',
    ),
  ) as { models: Array<Record<string, unknown>> };

  const model = catalog.models.find((m) => m.code === 'SPINAL-ALIGNER')!;
  const layers = model.layers as Array<Record<string, unknown>>;
  const inputs = model.sampleInputs as Record<string, number>;

  const template: TemplateDefinition = {
    id: 'sa',
    version: 1,
    layers: layers.map((l, i) => ({
      id: `l${i}`,
      sequence: i + 1,
      materialId: l.material as string,
      materialName: l.material as string,
      uomCode: l.uom as string,
      layerKey: l.key as string,
      thicknessFormula: (l.thickness as string) ?? null,
      usageFormula: l.usage as string,
    })),
  };

  it('computes requirements, then flags a shortfall, then a variance exception', () => {
    const qty = inputs.QUANTITY;
    const result = engine.computeRequirement(template, inputs, qty);

    // Requirement lines from the consolidated per-material totals.
    const reqs: RequirementLine[] = result.materialTotals.map((t) => ({
      materialId: t.materialId,
      materialName: t.materialName,
      requiredQty: t.standardQty,
    }));

    const rebonded = reqs.find((r) => r.materialId === 'Rebonded Foam')!;
    // 10.41666.. per unit * 3 = 31.25 CFT standard
    expect(rebonded.requiredQty).toBeCloseTo(31.25, 4);

    // Stock everything generously except Rebonded Foam (short by 10).
    const stock = new Map<string, number>();
    for (const r of reqs) stock.set(r.materialId, r.requiredQty + 100);
    stock.set('Rebonded Foam', rebonded.requiredQty - 10);

    const availability = checkAvailability(reqs, stock);
    expect(availability.ok).toBe(false);
    const shortLine = availability.lines.find(
      (l) => l.materialId === 'Rebonded Foam',
    )!;
    expect(shortLine.shortfall).toBeCloseTo(10, 4);

    // Actual consumption 2% over standard on Rebonded Foam → EXCEPTION at 1% tol.
    const variance = computeVariance(
      rebonded.requiredQty,
      rebonded.requiredQty * 1.02,
      0.01,
    );
    expect(variance.status).toBe('EXCEPTION');

    // A within-tolerance material stays clean.
    const within = computeVariance(rebonded.requiredQty, rebonded.requiredQty, 0.01);
    expect(within.status).toBe('WITHIN_TOLERANCE');
  });
});
