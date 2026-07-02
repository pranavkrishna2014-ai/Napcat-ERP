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
- [x] **Excel workbook migration**: all 16 factory models extracted into
      `prisma/data/model-catalog.json`, with golden-master tests verifying the
      engine reproduces every spreadsheet value
- [x] Seed that loads the full model catalog as ACTIVE production templates

## Phase 1 — Master data & authentication ✅

- [x] Auth (JWT) + role-based guards (ADMIN, PLANNER, STORE, OPERATOR, QC),
      dependency-free scrypt password hashing, `@Public`/`@Roles`/`@CurrentUser`
- [x] CRUD + list/search/paginate + bulk Excel import for brands, models,
      variants, materials, UoM, material categories, warehouses, dealers,
      customers (generic `CrudService` + `BaseCrudController`)
- [x] Audit-log interceptor wired globally to all mutations (with secret
      redaction)
- [x] Global JWT auth + roles guards + validation pipe; seed creates roles and
      an initial admin user

## Phase 2 — Inventory core ✅

- [x] Inventory ledger service (append-only) + derived balance reconciliation
      (`reconcileAll` recomputes balances purely from the ledger)
- [x] Single choke point `postMovement` (transactional: ledger row + balance
      upsert, negative-stock guard); receipts, issues, returns, transfers,
      scrap
- [x] Authorized adjustments (ADMIN-only, mandatory reason, may go negative)
- [x] Contingent inventory lifecycle (recovery, consumption, balance, ledger) —
      kept separate from normal stock by inventory type
- [x] Barcode/QR-ready stock lookups (balances by material code) + ledger
      history queries
- [x] Pure `inventory-math` (signs, balance guard, reconciliation) unit-tested

## Phase 3 — Formula-driven production ✅

- [x] Production Template management + formula versioning API (DRAFT → ACTIVE
      archives prior version) + Formula Engine preview
- [x] Sales Order → submit → approval; approval auto-generates a production
      order per line via the variant's ACTIVE template
- [x] Production Order generation → Formula Engine → persisted
      MaterialRequirement (with formula snapshot); material availability check
      against the inventory ledger
- [x] Reservation → issue (through the inventory ledger) → actual consumption →
      variance analysis; contingent recovery / scrap posted on consumption
- [x] Domain integration test of the whole pipeline (no DB)

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

- [x] Excel workbook migration into production templates (see FORMULA_ENGINE.md)
- [ ] Migrate the "Custom" work-order sheets (free-dimension entry) once rules confirmed
- [ ] Operator-friendly UI: minimal typing, large buttons, fast search,
      barcode/QR, keyboard-first
- [ ] Automated tests per module
```
