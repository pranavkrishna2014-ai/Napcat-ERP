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

## Phase 4 — Manufacturing operations ✅

- [x] Foam cutting & quilting job-work tracking (issue → receive through the
      ledger, offcuts to scrap) — new `JobWork` model
- [x] Finished goods + unique serial number generation (BRAND-MODEL-YYMMDD-NNNN)
      on QC-passed completion; batch creation; finished-goods output posted to
      the ledger
- [x] MRP label payload (size, warranty, scannable serial) per unit
- [x] Serial traceability lookup (batch → PO → variant → warranty)
- [x] Quality control workflow (submit → PASS/FAIL/REWORK; completion gated on
      a QC pass)

## Phase 5 — Dispatch & Tally sync ✅

- [x] Dispatch planning; dispatching issues each serial out of FINISHED_GOOD
      inventory through the ledger and links serials to dispatch lines
- [x] Tally invoice import (invoice no/date/dealer/customer/serials) — the only
      data crossing from Tally; no amounts, no GST, no ledgers
- [x] Dispatch reconciliation (dispatched vs invoiced serials, pure + tested)

## Phase 6 — Warranty ✅

- [x] Warranty activation on invoice sync (start = invoice date), triggered by
      the Tally import
- [x] Expiry from model policy (pure month-arithmetic with clamping); claim
      intake with full validation and replacement history

## Phase 7 — Reporting & dashboards ✅

- [x] Variance dashboard (exceptions-first)
- [x] Low stock, pending QC, contingent balances, expiring warranties, open
      claims, dispatch reconciliation
- [x] `/dashboard/summary` — one-glance management view surfacing only what
      needs attention (`allClear` flag)

## Cross-cutting (ongoing)

- [x] Excel workbook migration into production templates (see FORMULA_ENGINE.md)
- [ ] Migrate the "Custom" work-order sheets (free-dimension entry) once rules confirmed
- [ ] Operator-friendly UI: minimal typing, large buttons, fast search,
      barcode/QR, keyboard-first
- [ ] Automated tests per module
```
