# Formula Engine

The Formula Engine is the **most important component** of this ERP. It replaces
the factory's Excel workbooks. Every mattress model stores **formulas instead of
quantities**, and material consumption is calculated **dynamically** whenever a
production order is created — never stored as fixed values.

Location: `src/formula-engine/`

## Why formulas, not a fixed BoM

The factory does not manufacture with fixed quantities. A mattress is built from
ordered **layers**, and each layer's material quantity depends on the order's
dimensions (length, width, overall height) and the thickness rules of the layers
below it. A fixed Bill of Materials cannot express this; formulas can.

## Data model

A model variant has one or more **Production Templates**, each **versioned**
(`DRAFT` → `ACTIVE` → `ARCHIVED`) so formulas evolve without losing history.

```
ProductionTemplate (version N)
├── TemplateVariable[]   LENGTH, WIDTH, HEIGHT, BORDER_WIDTH, ...
└── TemplateLayer[]      sequence, material, uom, layerKey,
                         thicknessFormula, usageFormula,
                         wastageRate, toleranceRate, isContingentEligible
```

Each `TemplateLayer` mirrors one row of the Excel Data sheet's WORKINGS table:
`thicknessFormula` is the "USAGE"/E column and `usageFormula` is the
"PER UNIT"/G column. Formulas are **Admin-editable at runtime** — adding a
model or changing a formula requires **no source-code changes**.

## Two-phase evaluation (matches the spreadsheet)

The engine evaluates a template in the same two steps Excel does:

1. **Thickness** (E column): resolve every layer's `thicknessFormula`. A
   thickness may be a constant (`"2"`), the full `HEIGHT`, or a **remainder**
   referencing *other* layers by their `layerKey` (`"HEIGHT - L1 - L2"`).
   Because a remainder can reference a layer listed **later** (e.g. Snuggle's
   rebonded foam = `HEIGHT - L1 - L6`), resolution is dependency-ordered via an
   iterative fixpoint. Circular references are detected and rejected.
2. **Usage per unit** (G column): evaluate each layer's `usageFormula` with the
   dimensions, this layer's resolved `THICKNESS`, and every layer's thickness
   by `layerKey`.

Final usage (H column) = per-unit × order quantity, with optional wastage on
top (the spreadsheets apply none).

## The expression language

A small, injection-safe arithmetic evaluator (`evaluator.ts`). It does **not**
use `eval`/`Function`. Supported:

- Operators: `+`  `-`  `*`  `/`  `^` (power, right-associative), unary `-`/`+`
- Grouping: `( ... )`
- Numeric literals: `1728`, `0.05`
- Variables: case-insensitive identifiers (upper-cased internally)

Errors are explicit: unknown variable, division by zero, malformed expression,
or a non-finite result all throw a `FormulaError`.

## Variables available to a formula

| Variable                 | Source                                                         |
| ------------------------ | ------------------------------------------------------------- |
| `LENGTH`, `WIDTH`, `HEIGHT` | Sales-order line dimensions (or variant defaults)          |
| `BORDER_WIDTH`           | Border fabric roll width (order input / template default)     |
| `THICKNESS`              | *This* layer's resolved thickness (from `thicknessFormula`)   |
| `L1`, `L2`, … (`layerKey`) | Any layer's resolved thickness — usable by any other layer   |
| any `TemplateVariable`   | Named constants/defaults declared on the template             |

## The four calculation types (from the workbooks)

Every layer across all 16 models reduces to one of these usage formulas:

| Type          | `usageFormula`                                                        | UoM  |
| ------------- | -------------------------------------------------------------------- | ---- |
| Volume        | `LENGTH * WIDTH * THICKNESS / 1728`                                   | CFT  |
| Border fabric | `((LENGTH * 2 + WIDTH * 2 + 5) / BORDER_WIDTH) * (HEIGHT + 1) * 2.54 / 100` | MTR  |
| Face fabric   | `(WIDTH + 5) * 2.54 / 100`  (top & bottom)                           | MTR  |
| Bonnel spring | `LENGTH * WIDTH / 144`                                                | SQFT |
| Fixed count   | `1`  (e.g. pocketed spring unit)                                      | PCS  |

`/1728` converts cubic inches → cubic feet; `/144` converts square inches →
square feet; `× 2.54 / 100` converts inches → metres. These are the factory's
standard divisors, taken verbatim from the spreadsheets.

## Worked example (Spinal Aligner, from the workbook)

A 6″ mattress, 75″ × 60″, border width 82″, quantity 3:

| # | Material       | thicknessFormula   | usageFormula                          | per-unit |
| - | -------------- | ------------------ | ------------------------------------- | -------- |
| 1 | 32D SS Foam    | `1`                | `LENGTH * WIDTH * THICKNESS / 1728`   | 2.604 CFT |
| 2 | 32D HR Foam    | `1`                | `LENGTH * WIDTH * THICKNESS / 1728`   | 2.604 CFT |
| 3 | Rebonded Foam  | `HEIGHT - L1 - L2` | `LENGTH * WIDTH * THICKNESS / 1728`   | 10.417 CFT |
| 4 | Border Fabric  | —                  | border formula                        | 0.596 MTR |
| 5 | Top Fabric     | —                  | `(WIDTH + 5) * 2.54 / 100`            | 1.651 MTR |
| 6 | Bottom Fabric  | —                  | `(WIDTH + 5) * 2.54 / 100`            | 1.651 MTR |

Layer 3's thickness = 6 − 1 − 1 = 4″, so 75 × 60 × 4 / 1728 = **10.4167 CFT**;
× 3 units = **31.25 CFT** final usage — matching the spreadsheet exactly.

## API

```ts
import { FormulaEngineService } from '@/formula-engine';

const engine = new FormulaEngineService();
const result = engine.computeRequirement(template, { LENGTH: 72, WIDTH: 60 }, orderQty);

result.layers;          // per-layer base qty, wastage, tolerance
result.materialTotals;  // consolidated per-material standard requirement for the order
```

`computeRequirement` returns per-layer results **and** consolidated per-material
totals (a material appearing in multiple layers is summed). These totals become
`MaterialRequirement` rows on the production order.

## Wastage, tolerance & variance

- **Wastage** (`wastageRate`) is added on top of the base formula result to get
  the quantity to reserve/issue.
- **Tolerance** (`toleranceRate`) defines the acceptable ± band between
  **standard** and **actual** consumption. `computeVariance()` classifies each
  material as `WITHIN_TOLERANCE` or `EXCEPTION`. Exceptions drive the variance
  dashboard.

## Excel workbook migration — done

The factory's two workbooks (`Napcat_WO_Processing.xlsx` and
`WORK_ORDER_PROCESSING.xlsx`) have been fully migrated. All **16 production
models** were extracted verbatim into
[`prisma/data/model-catalog.json`](../prisma/data/model-catalog.json) — layers,
materials, thickness rules, usage formulas and units — **without simplifying any
logic**. The catalog also records each model's sample inputs and the exact
per-unit values Excel produces.

Models migrated: Eco Plus, Toss, Spinal Aligner, Snuggle, Guardian, Hybrid
Siesta, Empress, Empress Plus, Nirvana, Legend (workbook 1); Comfort, Comfort
Plus, Signature, Aurora, Aurora Pro, Italiano (workbook 2).

**Golden-master verification:** `catalog.spec.ts` runs every model through the
engine and asserts each layer's per-unit output matches the spreadsheet value.
All models pass — the engine has fully replaced the spreadsheets.

`npm run db:seed` loads the entire catalog into the database as `ACTIVE`
production templates. To add or change a model, edit the catalog (or the
templates directly via the future admin UI) — **no source changes needed**.

### Adding a new model later

1. Identify its layers, materials, thickness rules and divisors.
2. Add an entry to the catalog with `thickness`/`usage` expressions using the
   variables above.
3. Add its Excel-verified `expectedPerUnit` values so the golden-master test
   guards it.
4. Seed (or create the template via the admin UI) and confirm the test passes.
