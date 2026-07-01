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

## Audit

Every successful `POST/PUT/PATCH/DELETE` writes an `AuditLog` row: user, action,
entity type, entity id, and the sanitized request body (passwords/tokens
redacted). Reads are never audited.
