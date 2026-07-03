# API (Phase 1)

All routes are under the `/api` prefix. Every request must carry a Bearer JWT
except those marked **public**. Request bodies are validated (unknown fields are
rejected). Every mutation is recorded to the audit log automatically.

## Authentication

| Method | Route         | Access  | Notes                                  |
| ------ | ------------- | ------- | -------------------------------------- |
| POST   | `/auth/login` | public  | `{ username, password }` → `{ accessToken, user }` |
| GET    | `/auth/me`    | any     | Returns the current user from the JWT  |

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin12345"}'
# → { "accessToken": "…", "user": { "id", "username", "fullName", "roles":["ADMIN"] } }

curl http://localhost:3000/api/brands -H "Authorization: Bearer $TOKEN"
```

The JWT embeds the user's roles, so authorization needs no DB round-trip.

## Roles

`ADMIN`, `PLANNER`, `STORE`, `OPERATOR`, `QC`. **ADMIN passes every check.**
Master-data writes require `ADMIN` or `PLANNER`; deletes require `ADMIN`.

## Master-data resources

Each of the following exposes the same REST shape:

| Method | Route            | Access          | Purpose                             |
| ------ | ---------------- | --------------- | ----------------------------------- |
| GET    | `/{resource}`    | any             | List — `?page&pageSize&search`      |
| GET    | `/{resource}/:id`| any             | Fetch one                           |
| POST   | `/{resource}`    | ADMIN, PLANNER  | Create                              |
| PATCH  | `/{resource}/:id`| ADMIN, PLANNER  | Update                              |
| DELETE | `/{resource}/:id`| ADMIN           | Soft-delete (or remove) — see below |
| POST   | `/{resource}/import` | ADMIN, PLANNER | Bulk import from an `.xlsx` upload (`file` field) |

Resources: `brands`, `units`, `material-categories`, `materials`, `models`,
`variants`, `warehouses`, `dealers`, `customers`.

- **Soft delete**: resources with an `isActive` flag (brands, materials, models,
  variants, warehouses, dealers) are deactivated, not removed — preserving
  history. Units, categories and customers are hard-removed (no transactions
  reference them yet).
- **List** responses are `{ data, total, page, pageSize }`; `search` matches the
  resource's key text fields case-insensitively.

### Bulk Excel import

Upload a spreadsheet; the first sheet is parsed and columns are matched to
fields by header **aliases** (case/space-insensitive), then validated with
row-precise error messages. Example for `materials` (references category by name
and unit by code, which are resolved to IDs automatically):

| Code | Material Name | Category | UOM | Density | Contingent |
| ---- | ------------- | -------- | --- | ------- | ---------- |
| FOAM-32D | 32D SS Foam | Foam | CFT | 32 | yes |

```bash
curl -X POST http://localhost:3000/api/materials/import \
  -H "Authorization: Bearer $TOKEN" \
  -F 'file=@materials.xlsx'
# → { "created": 1 }
```

## Inventory (Phase 2)

Every stock change flows through one transactional choke point that appends an
immutable ledger row (with running balance) and updates the derived
`StockBalance` cache. Decrements are blocked from going negative — only an
authorized ADMIN adjustment may.

| Method | Route                              | Access              | Purpose                              |
| ------ | ---------------------------------- | ------------------- | ------------------------------------ |
| GET    | `/inventory/balances`              | any                 | Balances — `?materialId&warehouseId&inventoryType` |
| GET    | `/inventory/balances/by-code/:code`| any                 | Barcode/QR lookup by material code   |
| GET    | `/inventory/ledger`                | any                 | Ledger history (filter + paginate)   |
| GET    | `/inventory/reconcile`             | ADMIN               | Recompute from ledger; report drift  |
| POST   | `/inventory/receipts`              | ADMIN/PLANNER/STORE | Goods in (`opening:true` for opening balance) |
| POST   | `/inventory/issues`                | ADMIN/PLANNER/STORE | Issue to a production order           |
| POST   | `/inventory/returns`               | ADMIN/PLANNER/STORE | Return unused material               |
| POST   | `/inventory/transfers`             | ADMIN/PLANNER/STORE | Warehouse-to-warehouse (out + in)    |
| POST   | `/inventory/scrap`                 | ADMIN/PLANNER/STORE | Move to scrap inventory              |
| POST   | `/inventory/contingent/recover`    | ADMIN/PLANNER/STORE | Recover foam/latex to contingent     |
| POST   | `/inventory/contingent/consume`    | ADMIN/PLANNER/STORE | Consume contingent stock             |
| POST   | `/inventory/adjustments`           | ADMIN               | Authorized correction (signed `delta` + `reason`) |

`inventoryType` ∈ `RAW_MATERIAL`, `SEMI_FINISHED`, `FINISHED_GOOD`,
`CONTINGENT`, `SCRAP`. Contingent and scrap never mix with normal stock.

```bash
# Receive 100 CFT of a material
curl -X POST http://localhost:3000/api/inventory/receipts \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"materialId":"…","warehouseId":"…","inventoryType":"RAW_MATERIAL","quantity":100}'

# Authorized correction (ADMIN): reduce by 2 with a reason
curl -X POST http://localhost:3000/api/inventory/adjustments \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"materialId":"…","warehouseId":"…","inventoryType":"RAW_MATERIAL","delta":-2,"reason":"cycle count"}'
```

## Formula-driven production (Phase 3)

The automated chain: **Sales Order → approval → production orders → Formula
Engine → material requirement → availability → reserve → issue → consumption →
variance.**

### Production templates (versioned, formula-driven)

| Method | Route                              | Access         | Purpose                                  |
| ------ | ---------------------------------- | -------------- | ---------------------------------------- |
| GET    | `/production-templates?variantId=` | any            | List versions for a variant              |
| GET    | `/production-templates/:id`        | any            | Fetch (layers + variables)               |
| POST   | `/production-templates`            | ADMIN/PLANNER  | Create next DRAFT version                 |
| POST   | `/production-templates/:id/activate` | ADMIN/PLANNER | Activate (archives prior ACTIVE version) |
| POST   | `/production-templates/:id/preview` | ADMIN/PLANNER | Dry-run the Formula Engine (`{inputs, quantity}`) |

### Sales orders

| Method | Route                     | Access         | Purpose                                    |
| ------ | ------------------------- | -------------- | ------------------------------------------ |
| POST   | `/sales-orders`           | ADMIN/PLANNER  | Create (with lines)                        |
| GET    | `/sales-orders/:id`       | any            | Fetch                                      |
| POST   | `/sales-orders/:id/submit`| ADMIN/PLANNER  | DRAFT → PENDING_APPROVAL                    |
| POST   | `/sales-orders/:id/approve`| ADMIN/PLANNER | Approve → **auto-generate production orders** |
| POST   | `/sales-orders/:id/reject`| ADMIN/PLANNER  | Reject                                     |

### Production orders

| Method | Route                               | Access              | Purpose                                   |
| ------ | ----------------------------------- | ------------------- | ----------------------------------------- |
| POST   | `/production-orders`                 | ADMIN/PLANNER       | Create + compute & persist requirement    |
| GET    | `/production-orders/:id`             | any                 | Fetch (requirements, reservations, etc.)  |
| GET    | `/production-orders/:id/availability`| any                 | Standard vs available stock (shortfalls)  |
| POST   | `/production-orders/:id/reserve`     | ADMIN/PLANNER/STORE | Reserve standard requirement              |
| POST   | `/production-orders/:id/issue`       | ADMIN/PLANNER/STORE | Issue material via the inventory ledger   |
| POST   | `/production-orders/:id/consumption` | ADMIN/PLANNER/OPERATOR | Record actual usage → compute variance |
| GET    | `/production-orders/:id/variances`   | any                 | Variance (WITHIN_TOLERANCE / EXCEPTION)   |
| POST   | `/production-orders/:id/complete`    | ADMIN/PLANNER       | Mark completed                            |

Material requirement is **computed dynamically** by the Formula Engine at order
time (never a stored fixed quantity); the evaluated formulas are snapshotted per
material for audit. Issues flow through the same inventory choke point as Phase
2, so every production movement is a traceable ledger entry.

## Manufacturing operations (Phase 4)

### Quality control & completion (per production order)

| Method | Route                                | Access             | Purpose                                     |
| ------ | ------------------------------------ | ------------------ | ------------------------------------------- |
| POST   | `/production-orders/:id/qc/submit`   | ADMIN/PLANNER/QC   | Open a QC inspection (→ QC_PENDING)         |
| POST   | `/production-orders/:id/qc`          | ADMIN/QC           | Record `PASS` / `FAIL` / `REWORK`           |
| GET    | `/production-orders/:id/qc`          | any                | Inspection history                          |
| POST   | `/production-orders/:id/complete`    | ADMIN/PLANNER      | **QC-gated**: batch + serials + finished goods + ledger output (`{warehouseId}`) |

### Finished goods & serials

| Method | Route                       | Access | Purpose                                   |
| ------ | --------------------------- | ------ | ----------------------------------------- |
| GET    | `/finished-goods?variantId=`| any    | List finished goods                       |
| GET    | `/serials/:serial`          | any    | Full traceability (batch → PO → variant → warranty) |
| GET    | `/serials/:serial/label`    | any    | MRP label payload (size, warranty, scannable serial) |

Completion generates a unique serial per unit (`BRAND-MODEL-YYMMDD-NNNN`),
one `FinishedGood` each, and posts a `PRODUCTION_OUTPUT` movement into
`FINISHED_GOOD` inventory — all in one flow, gated on a QC pass.

### Job-work (foam cutting / quilting)

| Method | Route                    | Access                        | Purpose                                  |
| ------ | ------------------------ | ----------------------------- | ---------------------------------------- |
| POST   | `/job-work`              | ADMIN/PLANNER/STORE/OPERATOR  | Issue material to a `FOAM_CUTTING`/`QUILTING` job |
| POST   | `/job-work/:id/receive`  | ADMIN/PLANNER/STORE/OPERATOR  | Receive semi-finished back (+ offcut to scrap) |
| GET    | `/job-work`              | any                           | List (`?productionOrderId&status`)       |
| GET    | `/job-work/:id`          | any                           | Fetch                                    |

Both job-work legs are ordinary traceable ledger movements: issue consumes raw
material; receipt posts the component into `SEMI_FINISHED`.

## Dispatch & Tally sync (Phase 5)

| Method | Route                     | Access              | Purpose                                   |
| ------ | ------------------------- | ------------------- | ----------------------------------------- |
| POST   | `/dispatch`               | ADMIN/PLANNER/STORE | Create a dispatch plan (lines of serials) |
| POST   | `/dispatch/:id/dispatch`  | ADMIN/PLANNER/STORE | Issue serials out of finished goods (`{warehouseId}`) |
| GET    | `/dispatch/:id`           | any                 | Fetch a plan                              |
| GET    | `/dispatch`               | any                 | List (`?status`)                          |
| GET    | `/dispatch/reconcile`     | any                 | Dispatched vs invoiced serials            |
| POST   | `/tally/invoices`         | ADMIN/PLANNER       | **Import a Tally invoice** → activates warranties |

The Tally import is the only inbound data from accounting — invoice number,
date, dealer, customer name and serials sold. **No amounts, GST or ledgers.**

## Warranty & claims (Phase 6)

| Method | Route                        | Access        | Purpose                                     |
| ------ | ---------------------------- | ------------- | ------------------------------------------- |
| GET    | `/warranties/:serial`        | any           | Warranty for a serial                       |
| GET    | `/warranties/expiring?days=` | any           | Active warranties expiring soon             |
| POST   | `/warranty-claims`           | ADMIN/PLANNER | File a claim (validated) — `{serial, reason, dealerId?}` |
| POST   | `/warranty-claims/:id/decide`| ADMIN         | `APPROVED` / `REJECTED` / `REPLACED`        |
| GET    | `/warranty-claims?status=`   | any           | List claims                                 |

Warranty is **dormant at manufacture** and activates only on invoice sync:
start = invoice date, expiry = model policy duration. Claims validate serial,
activation, period, dealer and prior replacement before they open.

## Dashboards (Phase 7)

Read-only, exceptions-first. All under `/dashboard`:

`summary` · `variance-exceptions` · `low-stock` · `pending-qc` · `contingent` ·
`warranty-expiring?days=` · `open-claims` · `dispatch-reconciliation`

`/dashboard/summary` returns counts of everything needing attention plus an
`allClear` flag.

## Audit

Every successful `POST/PUT/PATCH/DELETE` writes an `AuditLog` row: user, action,
entity type, entity id, and the sanitized request body (passwords/tokens
redacted). Reads are never audited.
