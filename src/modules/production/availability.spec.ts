import { checkAvailability, RequirementLine } from './availability';
import { toTemplateDefinition, TemplateRow } from './template-mapper';

describe('checkAvailability', () => {
  const reqs: RequirementLine[] = [
    { materialId: 'foam', materialName: 'HR Foam', requiredQty: 100 },
    { materialId: 'latex', materialName: 'Latex', requiredQty: 20 },
  ];

  it('passes when all materials are sufficient', () => {
    const result = checkAvailability(
      reqs,
      new Map([
        ['foam', 150],
        ['latex', 20],
      ]),
    );
    expect(result.ok).toBe(true);
    expect(result.lines.every((l) => l.sufficient)).toBe(true);
    expect(result.lines[0].shortfall).toBe(0);
  });

  it('reports shortfalls and fails overall', () => {
    const result = checkAvailability(
      reqs,
      new Map([
        ['foam', 80],
        // latex missing entirely
      ]),
    );
    expect(result.ok).toBe(false);
    const foam = result.lines.find((l) => l.materialId === 'foam')!;
    const latex = result.lines.find((l) => l.materialId === 'latex')!;
    expect(foam.shortfall).toBe(20);
    expect(foam.sufficient).toBe(false);
    expect(latex.available).toBe(0);
    expect(latex.shortfall).toBe(20);
  });
});

describe('toTemplateDefinition', () => {
  it('maps DB rows (incl. Decimal-as-string) to a Formula Engine template', () => {
    const row: TemplateRow = {
      id: 'tpl1',
      version: 2,
      overallHeight: '6',
      variables: [
        { key: 'BORDER_WIDTH', defaultValue: '82' },
        { key: 'ignored', defaultValue: null },
      ],
      layers: [
        {
          id: 'l1',
          sequence: 1,
          materialId: 'm1',
          material: { name: '32D SS' },
          uom: { code: 'CFT' },
          layerKey: 'L1',
          thicknessFormula: '1',
          usageFormula: 'LENGTH * WIDTH * THICKNESS / 1728',
          wastageRate: '0',
          toleranceRate: '0.01',
          isContingentEligible: true,
        },
      ],
    };
    const def = toTemplateDefinition(row);
    expect(def).toMatchObject({ id: 'tpl1', version: 2, overallHeight: 6 });
    expect(def.variables).toEqual({ BORDER_WIDTH: 82 });
    expect(def.layers[0]).toMatchObject({
      layerKey: 'L1',
      materialName: '32D SS',
      uomCode: 'CFT',
      thicknessFormula: '1',
      usageFormula: 'LENGTH * WIDTH * THICKNESS / 1728',
      toleranceRate: 0.01,
      isContingentEligible: true,
    });
  });
});
