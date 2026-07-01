import {
  computeVariance,
  FormulaEngineService,
} from './formula-engine.service';
import { TemplateDefinition } from './types';

describe('FormulaEngineService', () => {
  const engine = new FormulaEngineService();

  /**
   * The three-layer example straight from the master specification:
   *   Layer 1: 32D Super Soft Foam  — L x W x fixedThickness / 1728
   *   Layer 2: Latex                — L x W x fixedThickness / 1728
   *   Layer 3: HR Foam              — L x W x (OVERALL_HEIGHT - L1 - L2) / 1728
   */
  const template: TemplateDefinition = {
    id: 'tpl-1',
    version: 1,
    overallHeight: 8,
    layers: [
      {
        id: 'l1',
        sequence: 1,
        materialId: 'foam-32d',
        materialName: '32D Super Soft Foam',
        uomCode: 'CF',
        formula: 'LENGTH * WIDTH * THICKNESS / 1728',
        fixedThickness: 2,
        wastageRate: 0,
        toleranceRate: 0.01,
        isContingentEligible: true,
      },
      {
        id: 'l2',
        sequence: 2,
        materialId: 'latex',
        materialName: 'Latex',
        uomCode: 'CF',
        formula: 'LENGTH * WIDTH * THICKNESS / 1728',
        fixedThickness: 1,
        wastageRate: 0,
        toleranceRate: 0.01,
        isContingentEligible: true,
      },
      {
        id: 'l3',
        sequence: 3,
        materialId: 'hr-foam',
        materialName: 'HR Foam',
        uomCode: 'CF',
        formula:
          'LENGTH * WIDTH * (OVERALL_HEIGHT - LAYER1_THICKNESS - LAYER2_THICKNESS) / 1728',
        wastageRate: 0.05,
        toleranceRate: 0.01,
        isContingentEligible: false,
      },
    ],
  };

  it('computes each layer for a 72x36x8 mattress', () => {
    const result = engine.computeRequirement(
      template,
      { LENGTH: 72, WIDTH: 36 },
      1,
    );

    const [l1, l2, l3] = result.layers;
    expect(l1.baseQtyPerUnit).toBeCloseTo((72 * 36 * 2) / 1728, 6); // 3 CF
    expect(l2.baseQtyPerUnit).toBeCloseTo((72 * 36 * 1) / 1728, 6); // 1.5 CF
    // remaining height = 8 - 2 - 1 = 5
    expect(l3.baseQtyPerUnit).toBeCloseTo((72 * 36 * 5) / 1728, 6); // 7.5 CF
  });

  it('applies wastage on top of the base quantity', () => {
    const result = engine.computeRequirement(
      template,
      { LENGTH: 72, WIDTH: 36 },
      1,
    );
    const l3 = result.layers[2];
    expect(l3.qtyPerUnitWithWastage).toBeCloseTo(l3.baseQtyPerUnit * 1.05, 6);
  });

  it('scales totals by order quantity', () => {
    const result = engine.computeRequirement(
      template,
      { LENGTH: 72, WIDTH: 36 },
      10,
    );
    const hrFoam = result.materialTotals.find((m) => m.materialId === 'hr-foam')!;
    expect(hrFoam.standardQty).toBeCloseTo(hrFoam.qtyPerUnitWithWastage * 10, 6);
  });

  it('consolidates a material that appears in multiple layers', () => {
    const dupTemplate: TemplateDefinition = {
      id: 'tpl-dup',
      version: 1,
      overallHeight: 6,
      layers: [
        {
          id: 'a',
          sequence: 1,
          materialId: 'foam-x',
          formula: 'LENGTH * WIDTH * 1 / 1728',
        },
        {
          id: 'b',
          sequence: 2,
          materialId: 'foam-x',
          formula: 'LENGTH * WIDTH * 2 / 1728',
        },
      ],
    };
    const result = engine.computeRequirement(
      dupTemplate,
      { LENGTH: 72, WIDTH: 36 },
      1,
    );
    expect(result.materialTotals).toHaveLength(1);
    expect(result.materialTotals[0].baseQtyPerUnit).toBeCloseTo(
      (72 * 36 * 3) / 1728,
      6,
    );
  });

  it('rejects a non-positive order quantity', () => {
    expect(() =>
      engine.computeRequirement(template, { LENGTH: 72, WIDTH: 36 }, 0),
    ).toThrow(/positive integer/);
  });

  it('raises a clear error when a layer would go negative (bad height)', () => {
    // OVERALL_HEIGHT smaller than the sum of fixed layers.
    expect(() =>
      engine.computeRequirement(
        { ...template, overallHeight: 2 },
        { LENGTH: 72, WIDTH: 36 },
        1,
      ),
    ).toThrow(/negative quantity/);
  });
});

describe('computeVariance', () => {
  it('flags within tolerance', () => {
    const v = computeVariance(100, 100.5, 0.01); // +0.5% <= 1%
    expect(v.varianceQty).toBeCloseTo(0.5, 6);
    expect(v.variancePct).toBeCloseTo(0.5, 4);
    expect(v.status).toBe('WITHIN_TOLERANCE');
  });

  it('flags an exception when tolerance is breached', () => {
    const v = computeVariance(100, 102, 0.01); // +2% > 1%
    expect(v.status).toBe('EXCEPTION');
  });

  it('handles a zero standard gracefully', () => {
    expect(computeVariance(0, 0, 0.01).status).toBe('WITHIN_TOLERANCE');
    expect(computeVariance(0, 5, 0.01).status).toBe('EXCEPTION');
  });
});
