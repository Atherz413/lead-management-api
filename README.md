# Lead Management API

A RESTful API for managing a sales lead pipeline — built with Node.js, Express, TypeScript, and PostgreSQL.

**Live:** `https://lead-management-api-production-c3ab.up.railway.app`  
**CI:** ![CI](https://github.com/Atherz413/lead-management-api/actions/workflows/ci.yml/badge.svg)

---

## Background

At a digital marketing agency, a sales team received leads from 3 sources: two admin-filled sheets (Ref, Admin) and a web form. The manager assigned leads to each salesperson via a round-robin dropdown, and all leads were aggregated into a shared "SPL" sheet using spreadsheet formulas.

**The problems with the original system:**

Lead IDs were generated from entry dates. If an admin entered a date incorrectly and corrected it later, a new lead would insert itself mid-sheet — shifting every row below it. This caused the data salespeople had manually filled in (brand name, budget, client type) to silently move to the wrong customer. Staff had to manually re-check and re-correct their entries after every such incident.

Additionally, since all salespeople shared a single sheet, accidental filtering or deletion frequently affected other people's data.

**What the Apps Script system did:**

Built a sync engine using a 2-Pass pattern to solve both problems:

**Pass 1 (Backup):** Before writing anything, read every salesperson's individual sheet and back up the data they had manually entered into memory. Also detect any leads that had been transferred (PIC changed in the source but still existed in the old owner's sheet) — log these to `Lead_Transfer_Log` with a timestamp and data snapshot.

**Pass 2 (Write):** Compare Lead IDs between Check SPL Main (source of truth) and each salesperson's sheet:
- Lead ID already exists → update only the source-pulled columns, never touch the manually-entered columns
- Lead ID is new → append to the bottom, never insert mid-sheet

Appending instead of inserting meant existing rows never shifted. Salespeople's manually-entered data stayed in place. The trade-off was that late-inserted leads appeared at the bottom rather than in date order — a trade-off the team accepted because their process was to contact all leads within the same week regardless of order, and data accuracy was the higher priority.

**A real bug found in production:**

After deployment, one salesperson's sheet developed duplicate lead entries — the same Lead ID appearing twice — and re-running the sync never fixed it.

The cause: the script tracked existing Lead IDs using a `Map`. If a Lead ID appeared twice in a sheet, the second entry would overwrite the first in the Map, making the first row invisible to the sync engine. The engine would then see only one entry, think there was no duplicate, and do nothing.

The fix applied at the time was to recreate the sheet from scratch, which reset the state entirely. The correct fix would have been a deduplication pre-pass: scan all Lead IDs in the destination sheet using a `Set` before syncing, collect any duplicate rows, delete them bottom-up, then proceed with the normal sync.

**This API rebuilds the same business logic on a proper backend stack:**

| Apps Script (original) | This API |
|---|---|
| Check SPL Main sheet | `leads` table (source of truth) |
| Per-salesperson sheets | Query filtered by `owner_id` |
| Lead_Transfer_Log sheet | `lead_transfers` table (audit log) |
| 2-Pass Sync function | PostgreSQL transaction (`BEGIN...COMMIT`) |
| Conflict resolution logic | Endpoint validation + HTTP error response |

---

## Features

- JWT authentication with role-based access control (`admin` / `sales`)
- Lead lifecycle management: create, update status, assign/transfer between owners
- Transactional lead assignment with full audit trail (`lead_transfers` table)
- Conflict detection: cannot reassign a closed lead (returns 409)
- Pagination on `GET /leads`
- Integration test suite (Supertest + Jest) with CI via GitHub Actions

---

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express
- **Database:** PostgreSQL (`pg`)
- **Auth:** JWT (`jsonwebtoken`) + bcrypt
- **Validation:** express-validator
- **Testing:** Jest + Supertest
- **CI:** GitHub Actions
- **Deploy:** Railway

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ running locally

### Setup

```bash
git clone https://github.com/Atherz413/lead-management-api.git
cd lead-management-api
npm install
```

Create a `.env` file (see `.env.example`):

```env
DATABASE_URL=postgresql://postgres@localhost:5432/lead_dev
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/lead_test
JWT_SECRET=your-secret-key
```

Run migrations and seed data:

```bash
psql lead_dev < migrations/001_init.sql
psql lead_dev < migrations/002_seed.sql
```

Start the server:

```bash
npm run dev
```

Server runs at `http://localhost:3000`

### Run Tests

Create a test database first:

```bash
createdb lead_test
psql lead_test < migrations/001_init.sql
```

Then:

```bash
npm test
```

---

## API Overview

Base URL: `/api/v1`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | — | Get JWT token |
| GET | `/leads` | Any | List leads (sales sees own only) |
| POST | `/leads` | Admin | Create lead |
| GET | `/leads/:id` | Any | Get lead + transfer history |
| PATCH | `/leads/:id` | Owner or Admin | Update status / note |
| PATCH | `/leads/:id/assign` | Admin | Reassign lead (transactional) |
| GET | `/users` | Admin | List sales users + active lead count |

Full request/response examples: see `postman_collection.json`

---

## Architecture Decisions

### Why a Services Layer?

The `PATCH /leads/:id/assign` endpoint runs a multi-step PostgreSQL transaction: lock row → validate target owner → update lead → insert audit log. Keeping this in the controller would mix HTTP handling with database transaction logic.

By moving it to `src/services/leads.service.ts`, the transaction logic can be tested independently without mocking the HTTP layer. The controller stays thin — it receives the request, calls the service, and returns the result.

```
routes/ → controllers/ → services/ → db.ts
```

### Why PostgreSQL Transactions for Assignment?

The original Apps Script system used a "2-Pass Sync" pattern (backup → write) because Apps Script has no transaction support. The risk was: if a write failed halfway, a lead could end up assigned in the `leads` table with no record in the audit log.

In this API, `PATCH /leads/:id/assign` runs inside a single `BEGIN...COMMIT` block:

1. `SELECT ... FOR UPDATE` — locks the row, prevents concurrent reassignment
2. Validate: is the lead closed? Is the target user a valid sales role?
3. `UPDATE leads SET owner_id = ...`
4. `INSERT INTO lead_transfers` (audit log)
5. `COMMIT`

If any step fails, `ROLLBACK` fires automatically. Either both writes happen or neither does.

### Why Separate `lead_transfers` Table?

Keeping the audit trail in a separate table (rather than a `note` column on `leads`) means:

- Full history is queryable: every ownership change is a row with timestamp, from/to owners, reason, and who performed the transfer
- The `leads` table stays as a clean current-state record
- Transfer history can be extended later (e.g. filtering by date range, by salesperson) without schema changes to `leads`

---

## What I'd Do Next

**`lead_activities` table** — The current `note` field is free-form text. A real CRM needs structured activity tracking per lead: call logs, meeting notes, follow-up outcomes. This would be a separate table:

```sql
CREATE TABLE lead_activities (
  id          SERIAL PRIMARY KEY,
  lead_id     INTEGER NOT NULL REFERENCES leads(id),
  user_id     INTEGER NOT NULL REFERENCES users(id),
  type        VARCHAR(20) CHECK (type IN ('call', 'note', 'meeting', 'email')),
  outcome     VARCHAR(50),
  note        TEXT,
  activity_at TIMESTAMPTZ DEFAULT NOW()
);
```

Endpoint: `POST /api/v1/leads/:id/activities`

**Structured fields on `leads`** — Adding `budget`, `brand`, `kickoff_date` as typed columns instead of burying them in `note` text, enabling filtering and reporting.

**Cursor-based pagination** — The current `GET /leads` uses offset pagination (`LIMIT x OFFSET y`). For large datasets, offset pagination degrades as the offset grows. Cursor-based pagination (using `id` or `created_at` as a cursor) stays O(1) regardless of page depth.

**Soft delete** — Replace `DELETE` with a `deleted_at` column. Leads are business records; permanent deletion loses history. A soft delete lets the data be recovered and keeps audit trails intact.

**Rate limiting** — Add `express-rate-limit` on auth endpoints to limit brute-force attempts on `POST /auth/login`.

---

## Project Structure

```
lead-management-api/
├── src/
│   ├── index.ts              ← entry point (listen)
│   ├── app.ts                ← Express app setup
│   ├── db.ts                 ← PostgreSQL pool
│   ├── middleware/
│   │   ├── authenticate.ts   ← JWT verification
│   │   ├── authorize.ts      ← role check
│   │   └── validate.ts       ← input validation
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── leads.ts
│   │   └── users.ts
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── leads.controller.ts
│   │   └── users.controller.ts
│   └── services/
│       └── leads.service.ts  ← transaction logic
├── tests/
│   ├── leads.integration.test.ts
│   └── auth.integration.test.ts
├── migrations/
│   ├── 001_init.sql          ← schema
│   └── 002_seed.sql          ← dev seed data
├── postman_collection.json
├── .env.example
├── jest.config.js
├── tsconfig.json
└── package.json
```
