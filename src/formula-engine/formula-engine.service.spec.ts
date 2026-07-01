import {
  computeVariance,
  FormulaEngineService,
} from './formula-engine.service';
import { TemplateDefinition } from './types';

describe('FormulaEngineService', () => {
  const engine = new FormulaEngineService();

  /**
   * A representative template (Spinal Aligner from the factory workbook):
   *   L1 32D SS foam   thickness 1
   *   L2 32D HR foam   thickness 1
   *   L3 Rebonded foam thickness = HEIGHT - L1 - L2 (remainder)
   *   L4 Border fabric
   *   L5 Top fabric
   *   L6 Bottom fabric
   */
  const template: TemplateDefinition = {
    id: 'tpl-sa',
    version: 1,
    layers: [
      {
        id: 'l1',
        sequence: 1,
        materialId: 'ss',
        materialName: '32D SS Foam',
        uomCode: 'CFT',
        layerKey: 'L1',
        thicknessFormula: '1',
        usageFormula: 'LENGTH * WIDTH * THICKNESS / 1728',
        isContingentEligible: true,
      },
      {
        id: 'l2',
        sequence: 2,
        materialId: 'hr',
        materialName: '32D HR Foam',
        uomCode: 'CFT',
        layerKey: 'L2',
        thicknessFormula: '1',
        usageFormula: 'LENGTH * WIDTH * THICKNESS / 1728',
        isContingentEligible: true,
      },
      {
        id: 'l3',
        sequence: 3,
        materialId: 'reb',
        materialName: 'Rebonded Foam',
        uomCode: 'CFT',
        layerKey: 'L3',
        thicknessFormula: 'HEIGHT - L1 - L2',
        usageFormula: 'LENGTH * WIDTH * THICKNESS / 1728',
      },
      {
        id: 'l4',
        sequence: 4,
        materialId: 'border',
        materialName: 'Border Fabric',
        uomCode: 'MTR',
        thicknessFormula: null,
        usageFormula:
          '((LENGTH * 2 + WIDTH * 2 + 5) / BORDER_WIDTH) * (HEIGHT + 1) * 2.54 / 100',
      },
    ],
  };

  const inputs = { LENGTH: 75, WIDTH: 60, HEIGHT: 6, BORDER_WIDTH: 82 };

  it('resolves fixed and remainder thicknesses', () => {
    const r = engine.computeRequirement(template, inputs, 1);
    expect(r.layers[0].resolvedThickness).toBe(1);
    expect(r.layers[1].resolvedThickness).toBe(1);
    expect(r.layers[2].resolvedThickness).toBe(4); // 6 - 1 - 1
    expect(r.layers[3].resolvedThickness).toBeNull();
  });

  it('computes per-unit usage matching the spreadsheet', () => {
    const r = engine.computeRequirement(template, inputs, 1);
    expect(r.layers[0].baseQtyPerUnit).toBeCloseTo((75 * 60 * 1) / 1728, 6);
    expect(r.layers[2].baseQtyPerUnit).toBeCloseTo((75 * 60 * 4) / 1728, 6);
    expect(r.layers[3].baseQtyPerUnit).toBeCloseTo(0.5962804878048781, 6);
  });

  it('resolves a remainder that references a layer listed later (Snuggle case)', () => {
    const snuggle: TemplateDefinition = {
      id: 'tpl-snu',
      version: 1,
      layers: [
        {
          id: 'a',
          sequence: 1,
          materialId: 'ss',
          layerKey: 'L1',
          thicknessFormula: '1',
          usageFormula: 'LENGTH * WIDTH * THICKNESS / 1728',
        },
        {
          id: 'b',
          sequence: 2,
          materialId: 'reb',
          layerKey: 'L2',
          thicknessFormula: 'HEIGHT - L1 - L6', // references a LATER layer
          usageFormula: 'LENGTH * WIDTH * THICKNESS / 1728',
        },
        {
          id: 'c',
          sequence: 6,
          materialId: 'coir',
          layerKey: 'L6',
          thicknessFormula: '2',
          usageFormula: 'LENGTH * WIDTH * THICKNESS / 1728',
        },
      ],
    };
    const r = engine.computeRequirement(snuggle, inputs, 1);
    const reb = r.layers.find((l) => l.materialId === 'reb')!;
    expect(reb.resolvedThickness).toBe(3); // 6 - 1 - 2
    expect(reb.baseQtyPerUnit).toBeCloseTo(7.8125, 6);
  });

  it('scales final usage by order quantity', () => {
    const r = engine.computeRequirement(template, inputs, 3);
    const reb = r.materialTotals.find((m) => m.materialId === 'reb')!;
    expect(reb.standardQty).toBeCloseTo(reb.qtyPerUnitWithWastage * 3, 6);
    expect(reb.standardQty).toBeCloseTo(31.25, 4); // 10.41666.. * 3
  });

  it('rejects a non-positive order quantity', () => {
    expect(() => engine.computeRequirement(template, inputs, 0)).toThrow(
      /positive integer/,
    );
  });

  it('raises a clear error on a negative remainder thickness (bad height)', () => {
    expect(() =>
      engine.computeRequirement(template, { ...inputs, HEIGHT: 1 }, 1),
    ).toThrow(/negative thickness/);
  });

  it('detects a circular thickness reference', () => {
    const cyclic: TemplateDefinition = {
      id: 'cyc',
      version: 1,
      layers: [
        {
          id: 'a',
          sequence: 1,
          materialId: 'a',
          layerKey: 'L1',
          thicknessFormula: 'HEIGHT - L2',
          usageFormula: 'THICKNESS',
        },
        {
          id: 'b',
          sequence: 2,
          materialId: 'b',
          layerKey: 'L2',
          thicknessFormula: 'HEIGHT - L1',
          usageFormula: 'THICKNESS',
        },
      ],
    };
    expect(() => engine.computeRequirement(cyclic, inputs, 1)).toThrow(
      /circular reference/,
    );
  });
});

describe('computeVariance', () => {
  it('flags within tolerance', () => {
    const v = computeVariance(100, 100.5, 0.01); // +0.5% <= 1%
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
