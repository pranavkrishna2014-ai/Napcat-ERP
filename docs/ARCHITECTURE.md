# Architecture

## System boundary

```
                ┌───────────────────────────────────────────────┐
                │                     TALLY                       │
                │  Accounting · Billing · GST · Purchases ·       │
                │  Sales invoices · Returns · P&L · Balance Sheet │
                └───────────────────────────────────────────────┘
                        │  (invoice no, date, dealer, customer,
                        │   serials sold, qty)  — import ONLY
                        ▼
                ┌───────────────────────────────────────────────┐
                │            MATTRESS ERP (this system)           │
                │        the "Factory Operating System"           │
                │                                                 │
                │  Master data · Inventory ledger · Formula       │
                │  Engine · Production · Dispatch · Warranty ·     │
                │  Contingent · Serial/Batch · QC · Audit         │
                └───────────────────────────────────────────────┘
```

The boundary is strict and one-directional: **Tally → ERP** for minimal invoice
data only. The ERP never writes to Tally and never keeps accounting data.

## The automated production flow

The spec's guiding chain, expressed as system events:

```
Sales Order
   └─ Admin Approval
        └─ Material Availability Check
             └─ Production Order (per line/quantity)
                  └─ Formula Engine  ──►  Material Requirement (standard)
                       └─ Inventory Reservation
                            └─ Material Issue        (ledger: MATERIAL_ISSUE)
                                 └─ Production
                                      └─ Actual Consumption Entry
                                           └─ Production Variance Analysis
                                                └─ Finished Goods (+ serials)
                                                     └─ Dispatch (ledger: DISPATCH_ISSUE)
                                                          └─ Invoice created in Tally
                                                               └─ Invoice imported
                                                                    └─ Warranty Activated
```

Each arrow is automatic wherever possible. Operators only **scan, confirm,
issue, receive, complete, approve** — they never calculate.

## Layers

| Layer            | Responsibility                                                        |
| ---------------- | -------------------------------------------------------------------- |
| **API (NestJS)** | Feature modules, controllers, DTO validation, guards/roles           |
| **Domain**       | Formula Engine, variance, inventory ledger rules, warranty policy    |
| **Data (Prisma)**| Normalized PostgreSQL schema, migrations, the append-only ledger     |

The **Formula Engine** is deliberately pure and DB-free (`src/formula-engine/`)
so Production, Planning and Reporting can all reuse it. Database-loaded template
rows are mapped to plain `TemplateDefinition` objects before evaluation.

## Inventory ledger model

`InventoryLedger` is **append-only and authoritative**. Every movement records a
signed quantity, the running `balanceAfter`, and a source reference
(`refType`/`refId`). `StockBalance` is a *derived cache* for fast lookups and is
always reconstructable from the ledger. Adjustments require authorization and
are themselves ledger entries (`ADJUSTMENT_INCREASE`/`DECREASE`) — never silent
edits.

Contingent and Scrap inventory are separate `InventoryType`s and never mix with
normal stock.

## Traceability spine

`SerialNumber` is the spine tying operations together:

```
Batch → SerialNumber → FinishedGood → DispatchLine → TallyInvoice → Warranty → Claim → Replacement
```

Serials are globally unique (`@unique`) and printed on the MRP label.

## Audit & integrity

`AuditLog` records every important action (price/formula changes, adjustments,
approvals, logins, corrections) with before/after JSON snapshots. No operational
row is hard-deleted — status fields and audit records preserve history.

## Roles

Role-based access (ADMIN, PLANNER, STORE, OPERATOR, QC) governs who can approve
orders, edit formulas, and authorize adjustments. Formulas are Admin-editable at
runtime — **no source changes are needed** to add models or change formulas.
