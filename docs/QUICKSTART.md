# Quickstart — run the ERP

The ERP is a **REST API** (the factory backend). There is no web UI yet — you
interact with it over HTTP (browser for reads, Postman/curl, or a frontend built
later). Two ways to run it:

---

## Option A — Docker (recommended, one command)

Requires only **Docker Desktop** (or Docker Engine + Compose). No Node, no
manual PostgreSQL.

```bash
git clone <your repo URL>
cd Napcat-ERP
git checkout claude/mattress-erp-spec-o8vyrm

docker compose up --build
```

This starts PostgreSQL, creates the tables, seeds reference data (roles, the
admin user, and all 16 mattress models), and serves the API at
**http://localhost:3000/api**.

Stop with `Ctrl+C`; wipe the database with `docker compose down -v`.

---

## Option B — Local Node + PostgreSQL

Requires **Node 18+** (22 ideal) and a **PostgreSQL** you can connect to.

```bash
npm install
cp .env.example .env            # edit DATABASE_URL to your PostgreSQL
npm run prisma:generate
npm run prisma:migrate          # or: npx prisma db push
npm run db:seed
npm run start:dev               # http://localhost:3000/api
```

> If `prisma generate` fails to download its engine, you're on a restricted
> network — run it where `binaries.prisma.sh` is reachable.

---

## First calls

Everything except `POST /auth/login` needs a Bearer token.

```bash
# 1. Log in (seeded admin)
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin12345"}'
# → { "accessToken": "eyJ...", "user": { ..., "roles": ["ADMIN"] } }

# 2. Use the token
TOKEN="eyJ..."
curl -s http://localhost:3000/api/dashboard/summary  -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/brands             -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/materials          -H "Authorization: Bearer $TOKEN"
```

**Change the admin password immediately** (or set `SEED_ADMIN_PASSWORD` before
first seed). Default: `admin` / `admin12345`.

---

## A quick end-to-end walk-through

The full order-to-warranty flow (all real endpoints from
[`docs/API.md`](API.md)):

1. `POST /api/sales-orders` — create an order (dealer + variant + quantity)
2. `POST /api/sales-orders/:id/submit` then `.../approve` — auto-creates a
   production order and computes the material requirement via the Formula Engine
3. `GET /api/production-orders/:id/availability` — check stock
4. `POST /api/inventory/receipts` — receive any short materials
5. `POST /api/production-orders/:id/reserve` → `.../issue` → `.../consumption`
   — reserve, issue from the ledger, record actual usage (variance is computed)
6. `POST /api/production-orders/:id/qc/submit` → `.../qc` (PASS) →
   `.../complete` — QC, then generate serials + finished goods
7. `GET /api/serials/:serial/label` — the MRP label to print
8. `POST /api/dispatch` → `.../:id/dispatch` — ship the serials
9. `POST /api/tally/invoices` — import the Tally invoice → **activates warranty**
10. `GET /api/warranties/:serial` — confirm warranty (start = invoice date)
11. `GET /api/dashboard/summary` — management view of any exceptions

To see the calculations without a database, run `npm run demo`.
