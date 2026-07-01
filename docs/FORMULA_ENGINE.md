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
├── TemplateVariable[]   LENGTH, WIDTH, OVERALL_HEIGHT, ...
└── TemplateLayer[]      sequence, material, uom, formula,
                         fixedThickness, wastageRate, toleranceRate,
                         isContingentEligible
```

Formulas are **Admin-editable at runtime** — adding a model or changing a
formula requires **no source-code changes**.

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
| `OVERALL_HEIGHT`         | Template `overallHeight` or an order input                    |
| `THICKNESS`              | *This* layer's `fixedThickness` (convenience alias)           |
| `LAYER{n}_THICKNESS`     | The `fixedThickness` of layer *n* — visible to **later** layers |
| any `TemplateVariable`   | Named constants/defaults declared on the template             |

**Layer-thickness chaining** is what makes height-remainder formulas work:
each layer with a fixed thickness publishes `LAYER{sequence}_THICKNESS` to the
layers above it.

## Worked example (from the spec)

An 8″ mattress, 72″ × 60″, three layers:

| # | Material            | Formula                                                                 | Fixed thk |
| - | ------------------- | ---------------------------------------------------------------------- | --------- |
| 1 | 32D Super Soft Foam | `LENGTH * WIDTH * THICKNESS / 1728`                                     | 2″        |
| 2 | Latex               | `LENGTH * WIDTH * THICKNESS / 1728`                                     | 1″        |
| 3 | HR Foam             | `LENGTH * WIDTH * (OVERALL_HEIGHT - LAYER1_THICKNESS - LAYER2_THICKNESS) / 1728` | —  |

For `LENGTH=72, WIDTH=60, OVERALL_HEIGHT=8`:

- Layer 1 = 72 × 60 × 2 / 1728 = **5.0 CF**
- Layer 2 = 72 × 60 × 1 / 1728 = **2.5 CF**
- Layer 3 = 72 × 60 × (8 − 2 − 1) / 1728 = 72 × 60 × 5 / 1728 = **12.5 CF**
  - with 5% wastage → **13.125 CF**

`/1728` converts cubic inches to cubic feet — the factory's standard divisor.

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

## Migrating the Excel workbooks

The factory's existing workbooks are the manufacturing standard. Migration
converts each spreadsheet calculation into template layers + formulas **without
simplifying the logic**. Recommended process:

1. Identify each model's layers, materials, thickness rules and divisors.
2. Express each cell's calculation as a layer `formula` using the variables
   above (add `TemplateVariable`s for any model-specific constants).
3. Load them as an `ACTIVE` `ProductionTemplate` version.
4. Validate: run known orders through `computeRequirement` and compare against
   the spreadsheet outputs until they match to the expected precision.
5. Retire the spreadsheet for that model.

> The Excel files were not present in the repository at foundation time. Once
> provided, they can be imported model-by-model with the process above; the
> engine already supports the arithmetic those sheets use.
