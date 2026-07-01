# Data Model

The full schema lives in [`prisma/schema.prisma`](../prisma/schema.prisma).
PostgreSQL, fully normalized, designed for unlimited growth (brands, models,
variants, formula versions, warehouses, batches, users, transactions, warranty
and audit records). It contains **no accounting tables** — those stay in Tally.

## Module map

### Master data
`User`, `Role`, `UserRole`, `UnitOfMeasure`, `Brand`, `MaterialCategory`,
`Material`, `MattressModel`, `ModelVariant`, `Warehouse`, `Dealer`, `Customer`,
`WarrantyPolicy`.

### Formula Engine / Production Templates
`ProductionTemplate` (versioned) → `TemplateVariable`, `TemplateLayer`.
Layers carry the formulas; nothing stores fixed consumption. See
[FORMULA_ENGINE.md](FORMULA_ENGINE.md).

### Inventory
`StockBalance` (derived cache), `InventoryLedger` (append-only, authoritative),
`WarehouseTransfer`. Movement direction/reason is the `LedgerMovementType` enum;
stock class is the `InventoryType` enum (`RAW_MATERIAL`, `SEMI_FINISHED`,
`FINISHED_GOOD`, `CONTINGENT`, `SCRAP`).

### Batch & serial tracking
`Batch`, `SerialNumber` (globally unique). Serials link batch → finished good →
dispatch → invoice → warranty → claim.

### Sales & production
`SalesOrder` → `SalesOrderLine` → `ProductionOrder`. Per order:
`MaterialRequirement` (standard, from the engine), `MaterialReservation`,
`ProductionConsumption` (actual), `ProductionVariance`, `QcInspection`.

### Finished goods & dispatch
`FinishedGood`, `DispatchPlan` → `DispatchLine`.

### Tally integration (import only)
`TallyInvoice` → `TallyInvoiceLine`. Minimal fields for warranty activation and
dispatch reconciliation. No amounts, no GST, no ledgers.

### Warranty
`WarrantyPolicy`, `Warranty` (one per serial), `WarrantyClaim`. Warranty is
`PENDING_ACTIVATION` at manufacture and becomes `ACTIVE` only after invoice sync;
`startDate` = invoice date, `expiryDate` computed from the model's policy.

### Audit
`AuditLog` — every important action with before/after JSON snapshots.

## Key invariants

- **Ledger is truth.** `StockBalance` is always reconstructable from
  `InventoryLedger`. Every movement is a signed row with a `balanceAfter`
  snapshot and a `refType`/`refId` source pointer.
- **No silent adjustments.** Corrections are authorized ledger entries
  (`ADJUSTMENT_INCREASE`/`DECREASE`), never in-place edits.
- **Serials are unique and never reused.** `SerialNumber.serial @unique`.
- **Contingent ≠ normal stock.** Separate `InventoryType`; separate balances and
  ledger movements (`CONTINGENT_RECOVERY` / `CONTINGENT_CONSUMPTION`).
- **Formula versions are immutable once archived.** New formulas create a new
  `ProductionTemplate` version; historical orders keep the formula snapshot they
  were computed with (`MaterialRequirement.formulaSnapshot`).
- **Nothing operational is hard-deleted.** Status enums + `AuditLog` preserve
  history.

## Naming conventions

- Table names are `snake_case` via `@@map`; Prisma models are `PascalCase`.
- Money/amounts are intentionally absent — they live in Tally.
- Quantities use `Decimal(18,6)` for precision; percentages/rates use small
  `Decimal` scales.

## Entity relationship overview

```
Brand ──< MattressModel ──< ModelVariant ──< ProductionTemplate ──< TemplateLayer
                                   │                    └──< TemplateVariable
                                   └──< SalesOrderLine
SalesOrder ──< SalesOrderLine ──< ProductionOrder ──< MaterialRequirement
                                          ├──< MaterialReservation
                                          ├──< ProductionConsumption
                                          ├──< ProductionVariance
                                          ├──< QcInspection
                                          └──< FinishedGood ──< SerialNumber
Material ──< StockBalance / InventoryLedger        Batch ──< SerialNumber
Warehouse ──< StockBalance / InventoryLedger / WarehouseTransfer
DispatchPlan ──< DispatchLine ──< SerialNumber
TallyInvoice ──< TallyInvoiceLine     TallyInvoice ──< Warranty
SerialNumber ──1:1── Warranty ──< WarrantyClaim
WarrantyPolicy ──< MattressModel
User ──< AuditLog
```
