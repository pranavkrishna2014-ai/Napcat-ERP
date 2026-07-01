# Roadmap

Modules are built incrementally on the foundation, each adhering to the ERP's
core principles (formula-driven manufacturing, append-only inventory ledger,
serial traceability, audit trail, automation over typing).

## Phase 0 — Foundation ✅ (this commit)

- [x] Project scaffold (NestJS + TypeScript + Prisma + PostgreSQL, Jest)
- [x] Complete normalized database schema for **every** module in the spec
- [x] **Formula Engine** core — safe evaluator, requirement calculation,
      variance, with tests
- [x] Architecture, data-model and formula-engine documentation
- [x] Demo seed reproducing the spec's three-layer example

## Phase 1 — Master data & authentication

- [ ] Auth (JWT) + role-based guards (ADMIN, PLANNER, STORE, OPERATOR, QC)
- [ ] CRUD + bulk Excel import for brands, models, variants, materials, UoM,
      warehouses, dealers, customers
- [ ] Audit-log interceptor wired to all mutations

## Phase 2 — Inventory core

- [ ] Inventory ledger service (append-only) + derived balance reconciliation
- [ ] Receipts, transfers, adjustments (authorized), scrap
- [ ] Contingent inventory lifecycle (recovery, consumption, balance, ledger)
- [ ] Barcode/QR-ready stock lookups

## Phase 3 — Formula-driven production

- [ ] Production Template management + formula versioning UI/API
- [ ] Sales Order → approval → material availability check
- [ ] Production Order generation → Formula Engine → MaterialRequirement
- [ ] Reservation → issue → actual consumption → variance analysis

## Phase 4 — Manufacturing operations

- [ ] Foam cutting & quilting job-work tracking
- [ ] Finished goods + serial number generation & MRP label printing
- [ ] Quality control workflow

## Phase 5 — Dispatch & Tally sync

- [ ] Dispatch planning + dispatch ledger movements
- [ ] Tally invoice import (invoice no/date/dealer/customer/serials/qty)
- [ ] Dispatch reconciliation against imported invoices

## Phase 6 — Warranty

- [ ] Warranty activation on invoice sync (start = invoice date)
- [ ] Expiry from model policy; claim intake, validation, replacement history

## Phase 7 — Reporting & dashboards

- [ ] Variance dashboard (exceptions-first)
- [ ] Inventory, contingent, production, warranty dashboards
- [ ] Management views surfacing exceptions, not raw data

## Cross-cutting (ongoing)

- [ ] Excel workbook migration into production templates (see FORMULA_ENGINE.md)
- [ ] Operator-friendly UI: minimal typing, large buttons, fast search,
      barcode/QR, keyboard-first
- [ ] Automated tests per module
```
