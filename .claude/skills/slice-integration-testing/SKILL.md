---
name: slice-integration-testing
description: How to test Hotel PMS slices against the real Postgres test database through the CQRS executors (executeCommand / executeQuery / executePublicCommand) with per-test tenants from testkit.ts — covering guards, tenant isolation, roles, locking races, atomicity, append-only ledgers, exact money and audit rows. No DB mocks. Load for any test that touches a handler, kernel function, constraint or trigger.
---

# Slice integration testing

Slices are tested the way the app runs them: contract Zod parse → role check → one transaction → handler → audit → commit. Mocked Drizzle can't prove `FOR UPDATE`, exclusion constraints, triggers or rollback — so **don't mock the database**.

## Setup

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DB } from './db/client';
import { executeCommand, executePublicCommand, executeQuery } from './cqrs/execute';
import { DomainError } from './cqrs/errors';
import { guest, makeProperty, NOW, openTestDb, TEST_DB_URL, TODAY, type Fixture } from './testkit';

let db: DB;
let close: () => Promise<void>;
beforeAll(() => { if (TEST_DB_URL) ({ db, close } = openTestDb()); });
afterAll(async () => close?.());

const ctx = (f: Fixture, now = NOW) => ({ db, actor: f.admin, now });
async function code(p: Promise<unknown>) {
	const e = await p.then(() => null, (x: unknown) => x);
	expect(e).toBeInstanceOf(DomainError);
	return (e as DomainError).code;
}

describe.skipIf(!TEST_DB_URL)('<area> (integration)', () => { … });
```

- **Tenant per test:** `const f = await makeProperty(db, [['Std', 10000, 2], ['Dlx', 20000, 1]], { mode: 'UPFRONT' })` — UTC timezone, legacy 10% tax, an ADMIN (`f.admin`), room types with units (`f.types[i].units[j]`). Never truncate: ledger and audit tables are append-only, and isolation comes from separate properties.
- **Business time:** `NOW` = `2030-03-01T12:00Z`, `TODAY` = `'2030-03-01'`. Pass `now` through `ctx`; "tomorrow" = `new Date(NOW.getTime() + 86_400_000)`.
- **DB clock caveat:** `posted_at` / `paid_at` / `occurred_at` default to the real clock unless the handler passes `now` — reports filtered by date should use `dateIn(new Date(), 'UTC')`.
- **Other roles:** `{ ...f.admin, role: 'POS' as const }`. Other tenant: a second `makeProperty`.
- **Taxes / plans:** create through the slices (`UpsertTaxRule`, `UpsertRatePlan`) so tests exercise real paths; zero the legacy rate with `UPDATE property SET tax_rate_bp = 0` when the test needs explicit rules.

## Drive slices through executors (raw input, not pre-parsed)

```ts
const r = await executeCommand(CreateReservation, createFrontDeskReservation,
	{ roomTypeId: f.types[0]!.id, checkIn: TODAY, checkOut: addDays(TODAY, 2), adults: 1, guest }, ctx(f));
const view = await executeQuery(GetFolioLedger, getFolioLedger, { reservationId: r.reservationId }, ctx(f));
await executePublicCommand(CreateBooking, createBooking, { property: f.slug, … }, { db, now: NOW });
```

## Checklist — what a slice test covers

| Concern | Pattern |
| --- | --- |
| Happy path | ack shape + state read back (Drizzle select or the slice's query) |
| Status guard | `expect(await code(…)).toBe('CONFLICT')` |
| Validation | malformed input → `'VALIDATION'` (proves the contract schema) |
| Tenant isolation | other property's actor → `'NOT_FOUND'` (or empty read model) |
| Roles | POS / FRONT_DESK actor → `'FORBIDDEN'` where the contract restricts |
| Inventory | exact `sold_count` per date via `room_inventory_daily` select |
| Concurrency | `Promise.allSettled` of N competing commands → exactly K fulfilled, counters exact; mix input orders to exercise lock ordering |
| Atomicity | failing command → no new rows (bookings, reservations, audit) and counters unchanged |
| Money | exact cents: `2 * (10000 + 1000)` style arithmetic in the expectation, not a magic number |
| Ledger | folio totals equal the item/payment sums; reversals mirror tax lines; `UPDATE`/`DELETE` on ledger tables rejects |
| Constraints | overlap → `rejects.toMatchObject({ cause: expect.objectContaining({ code: '23P01' }) })` (Drizzle wraps pg errors in `cause`) |
| Audit | one `audit_event` per successful command, none on rollback, PII redacted |
| Idempotency | night audit / OTA ingest twice → second run changes nothing |

## Example — race on the last room

```ts
it('prevents double-booking the last room', async () => {
	const f = await makeProperty(db, [['Std', 10000, 1]]);
	const results = await Promise.allSettled(Array.from({ length: 8 }, () => book(f, '2030-03-10', '2030-03-12', 22000)));
	expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
	const rows = await db.select().from(roomInventoryDaily).where(eq(roomInventoryDaily.roomTypeId, f.types[0]!.id));
	expect(rows.map((r) => r.soldCount)).toEqual([1, 1]);
});
```

## Don't

- Mock `$lib/server/db`, Drizzle, postgres.js or `server/domain/*`.
- Call a handler directly with a hand-made `ctx` (skips role check, parsing, transaction, audit) — use the executors.
- Depend on another test's data or on execution order.
- Assert on raw Postgres error text — assert `DomainError.code` or SQLSTATE.

Run (needs `docker compose up -d db` and a migrated `pms_test`): `node22 'npx vitest run src/lib/server/<area>.integration.test.ts'` (PROJECT_CONTEXT §6).
