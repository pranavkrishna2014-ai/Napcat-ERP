# Mattress Manufacturing ERP

The **Factory Operating System** for a mattress manufacturing company.

This ERP manages the **entire operational workflow of the factory**. It is
**not** accounting software and it is **not** a generic inventory app.
**Tally remains the only accounting system** — billing, GST, purchases, sales
invoices, returns, financial statements and taxation all stay in Tally. This
ERP *complements* Tally and never attempts to replace it.

> Think of it as: **this ERP = manufacturing**, **Tally = accounting.**

---

## What this ERP does (and does not) do

| In scope (this ERP)                                   | Out of scope (stays in Tally)              |
| ----------------------------------------------------- | ------------------------------------------ |
| Master data, Inventory, Warehouses                    | Accounting, Ledgers, Voucher entry         |
| Formula-driven manufacturing & Production Orders      | Billing, GST, P&L, Balance Sheet           |
| Material planning, reservation, issue, consumption    | Purchase & Sales accounting, Banking       |
| Foam cutting, quilting job work, finished goods       | Purchase / Sales invoicing & returns       |
| Dispatch planning, Serial & Batch tracking            |                                            |
| Warranty tracking, Contingent inventory               |                                            |
| Production variance, QC, Audit logs, Dashboards       |                                            |

The **only** data imported from Tally is minimal invoice information (invoice
number, date, dealer, customer, serial numbers sold, quantity) — used solely to
**activate warranties** and **reconcile dispatch**. No ledgers, amounts or GST
ever enter this ERP.

---

## Core design principles

1. **Automation over typing.** Everything that can be calculated, derived,
   scanned or imported is never manually entered. Operators *confirm reality*;
   the software does the math.
2. **Formula-driven manufacturing — no fixed BoM.** Every mattress model is a
   versioned **Production Template** whose material layers carry *formulas*, not
   fixed quantities. Consumption is computed dynamically per order by the
   [Formula Engine](docs/FORMULA_ENGINE.md).
3. **Inventory is the heart.** Every stock movement writes an immutable
   **inventory ledger** entry with full traceability. Nothing is adjustable
   without authorization.
4. **End-to-end serial traceability.** Every finished mattress gets a unique
   serial linked through batch → finished goods → dispatch → invoice → warranty
   → claim → replacement.
5. **Warranty starts at invoice, not manufacture.** Warranty activates only
   after invoice sync from Tally; start date = invoice date.
6. **Nothing operational is ever hard-deleted.** Full audit trail and
   historical integrity.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full picture.

---

## Tech stack

- **Backend:** TypeScript + [NestJS](https://nestjs.com/)
- **Database:** PostgreSQL via [Prisma ORM](https://www.prisma.io/)
- **Formula Engine:** dependency-free, injection-safe expression evaluator
  (no `eval`) — `src/formula-engine/`
- **Tests:** Jest

---

## Repository layout

```
prisma/
  schema.prisma        # full normalized data model (all modules)
  seed.ts              # demo seed: one model with formula-driven layers
src/
  formula-engine/      # the Formula Engine (core) + tests
  common/              # shared services (Prisma)
  modules/             # feature modules (added incrementally)
  app.module.ts
  main.ts
docs/                  # architecture, data model, formula engine, roadmap
```

---

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure the database
cp .env.example .env      # then edit DATABASE_URL

# 3. Generate the Prisma client & create the schema
npm run prisma:generate
npm run prisma:migrate

# 4. (Optional) seed a demo model
npm run db:seed

# 5. Run tests
npm test

# 6. Start the API
npm run start:dev
```

> **Note:** `prisma generate`/`migrate` download Prisma's engine binaries on
> first run. In network-restricted environments (e.g. some CI/sandboxes) this
> download may be blocked; run it where `binaries.prisma.sh` is reachable. The
> Formula Engine and its tests do **not** require Prisma and run anywhere.

---

## Status

This is the **project foundation**: the complete database schema for every
module in the specification, a working and tested Formula Engine, and the
application scaffold. Feature modules (Inventory, Production, Dispatch,
Warranty, …) are built on top of this base — each adhering to the principles
above. See [`docs/ROADMAP.md`](docs/ROADMAP.md).
