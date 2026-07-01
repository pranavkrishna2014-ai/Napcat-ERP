import * as fs from 'fs';
import * as path from 'path';
import { FormulaEngineService } from './formula-engine.service';
import { LayerDefinition, TemplateDefinition } from './types';

/**
 * Golden-master test: every model extracted from the factory Excel workbooks
 * must reproduce, through the Formula Engine, the exact per-unit values Excel
 * produces for that model's sample inputs. This is the proof that the engine
 * has fully replaced the spreadsheets without simplifying any logic.
 */
interface CatalogLayer {
  key: string;
  material: string;
  uom: string;
  thickness: string | null;
  usage: string;
  expectedPerUnit: number;
  contingentEligible?: boolean;
}
interface CatalogModel {
  code: string;
  name: string;
  sampleInputs: Record<string, number>;
  layers: CatalogLayer[];
}

const catalog = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../prisma/data/model-catalog.json'),
    'utf8',
  ),
) as { models: CatalogModel[] };

function toTemplate(model: CatalogModel): TemplateDefinition {
  const layers: LayerDefinition[] = model.layers.map((l, idx) => ({
    id: `${model.code}-${l.key}`,
    sequence: idx + 1,
    materialId: `${model.code}-${l.material}`,
    materialName: l.material,
    uomCode: l.uom,
    layerKey: l.key,
    thicknessFormula: l.thickness,
    usageFormula: l.usage,
    isContingentEligible: l.contingentEligible ?? false,
  }));
  return { id: model.code, version: 1, layers };
}

describe('Excel workbook model catalog', () => {
  const engine = new FormulaEngineService();

  it('contains all 16 extracted production models', () => {
    expect(catalog.models).toHaveLength(16);
  });

  for (const model of catalog.models) {
    describe(`${model.name} (${model.code})`, () => {
      const template = toTemplate(model);
      const qty = model.sampleInputs.QUANTITY ?? 1;

      it('reproduces every layer per-unit value from the spreadsheet', () => {
        const result = engine.computeRequirement(
          template,
          model.sampleInputs,
          qty,
        );

        model.layers.forEach((expected, idx) => {
          const actual = result.layers[idx];
          expect(actual.materialName).toBe(expected.material);
          // 4 dp tolerance absorbs the engine's 6-dp rounding vs Excel doubles.
          expect(actual.baseQtyPerUnit).toBeCloseTo(expected.expectedPerUnit, 4);
        });
      });

      it('final usage equals per-unit x quantity for every layer', () => {
        const result = engine.computeRequirement(
          template,
          model.sampleInputs,
          qty,
        );
        for (const layer of result.layers) {
          const total = result.materialTotals.find(
            (m) => m.materialId === layer.materialId,
          )!;
          expect(total.standardQty).toBeCloseTo(
            total.qtyPerUnitWithWastage * qty,
            6,
          );
        }
      });
    });
  }
});
