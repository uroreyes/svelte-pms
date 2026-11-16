# Hotel PMS & Guest Folio — Architecture

Source spec: `hotel_pms_guest_folio_project_specification.md`.

## Phase 1 — Architect

### Stack
| Layer | Choice |
| --- | --- |
| App | SvelteKit 2 (Svelte 5 runes), TypeScript `strict` |
| Styling | Tailwind CSS 4 |
| DB | PostgreSQL 17 (Docker), Drizzle ORM + `postgres.js` |
| Validation | Zod 4 (isomorphic contracts) |
| Tests | Vitest (unit + DB integration) |

```text
DECISION: Framework
STATUS: accepted
CONTEXT: Spec suggests React/Remix but allows adjustment; repo + CLAUDE.md target Svelte.
OPTIONS:
  A. SvelteKit — matches workspace standard, SSR + endpoints in one app.
  B. Remix — matches spec literally, contradicts workspace.
RECOMMENDATION: A — workspace standard wins; spec explicitly permits adjustment.
CONSEQUENCE: Optimistic UI done with Svelte runes instead of Remix fetchers.
```

### Vertical slices
Every use case is one folder under `src/lib/features/<module>/<slice>/`:

```text
features/folio/post-charge/
  contract.ts          isomorphic: name, path, Zod input, result type, allowed roles
  handler.server.ts    server: the only code that executes the use case
  *.svelte             optional slice-owned UI
routes/api/folio/charges/+server.ts   3-line adapter: export const POST = staffCommand(contract, handler)
```

Slices never import each other. Cross-slice rules live in a small kernel:
- `lib/shared/domain/*` — pure, isomorphic rules (dates, money, availability, folio math, iCal).
- `lib/server/domain/*` — transactional building blocks shared by several slices
  (inventory locking, reservation factory, folio ledger, ARI outbox).

### CQRS when consuming the API
| | Command | Query |
| --- | --- | --- |
| HTTP | `POST` (JSON body) | `GET` (query string) |
| Server adapter | `staffCommand` / `publicCommand` | `staffQuery` / `publicQuery` |
| Transaction | exactly one per command (wrapped by adapter) | none, plain reads |
| Returns | ack only (`{ id }`, `{ code }`, counts) | UI-shaped read model (DTO) |
| Client | `send(contract, input)` → `invalidate(dep)` | `ask(contract, params, fetch)` in `load` |

Envelope: `{ ok: true, data } | { ok: false, error: { code, message, details } }`.
Pages never read the DB directly — `+page.ts` loads go through query endpoints with SvelteKit `fetch`
and `depends('app:<module>')`; mutations call commands then `invalidate`, with optimistic rows for
folio postings.

```text
DECISION: Inventory column semantics
STATUS: accepted
CONTEXT: Spec has `available_count` that is both manager-overridable and "deducted" on booking.
         A single mutable counter loses either the override or the deduction.
OPTIONS:
  A. available_count = sellable allotment, sold_count = consumed; remaining = available - sold.
  B. One counter decremented on booking; overrides overwrite it.
RECOMMENDATION: A — overrides never erase bookings; invariant sold <= available enforced on override.
CONSEQUENCE: Overrides below sold_count are rejected (409) with the offending dates. OTA ingest may
             exceed it and flags the reservation `overbooked`.
```

```text
DECISION: Rate snapshot
STATUS: accepted
CONTEXT: Rates change after booking; posted room charges must match the quoted price.
OPTIONS:
  A. reservation_night(reservation_id, date, rate_cents) captured at booking.
  B. Recompute from RoomInventoryDaily at posting time.
RECOMMENDATION: A — guest pays what was quoted; also gives KPIs a clean room-revenue source.
CONSEQUENCE: Rate edits only affect future bookings.
```

## Phase 2 — Auditor refinements (applied)
1. **Lock order** — inventory rows are always locked `ORDER BY date` for one room type → no deadlocks
   between concurrent bookings. Missing daily rows are created with `INSERT … ON CONFLICT DO NOTHING`
   before `SELECT … FOR UPDATE` so first-time dates are lockable.
2. **Room double-assignment** — guarded in the DB, not just app code: `EXCLUDE USING gist
   (room_unit_id WITH =, daterange(check_in, check_out) WITH &&)` for active reservations.
3. **Immutable ledger** — `folio_item` / `folio_payment` have `BEFORE UPDATE OR DELETE` triggers that
   raise. Voids are negative reversal rows (`reverses_item_id` unique ⇒ no double void).
4. **Folio totals** are a projection updated in the same transaction while the folio row is locked.
5. **Server-authoritative pricing** — booking re-quotes; client `expectedTotalCents` mismatch → 409
   `PRICE_CHANGED`.
6. **Transactional outbox** for ARI push — enqueue in the booking/inventory tx, deliver out-of-band
   with `FOR UPDATE SKIP LOCKED`.
7. **Tenant isolation** — every staff handler scopes by `actor.propertyId`.
8. Handlers receive `ctx.db` (no singleton import) ⇒ directly testable against a real DB.

## Phase 4 — Security notes
- Session cookie: random 256-bit token, only SHA-256 stored, `httpOnly`, `sameSite=lax`, `secure` in prod.
- Permission check per contract (one key each, 23 keys, editable per property in Setup → Roles & permissions; Super admin fixed). Grid edits audited as "Role permissions changed". Staff users managed in Setup → Staff (PR-03); temporary passwords force a change before any other access; deactivation revokes sessions immediately.
- OTA webhook: HMAC-SHA256 over raw body, constant-time compare; idempotent on `(source, external_ref)`.
- iCal import: https-only + DNS resolution rejects private/loopback/link-local ranges (SSRF), size + timeout caps.
- iCal export: unguessable per-mapping token, no guest PII in events.
- Public booking: per-IP rate limit; confirmation lookup requires code **and** last name.
- Guest ID numbers are encrypted at rest (AES-256-GCM envelope `v1:<keyId>:<iv>:<tag>:<ct>`, AAD bound to the guest row, keyring via `PII_ENCRYPTION_KEY` / `PII_ENCRYPTION_PREVIOUS_KEYS`, DB CHECK rejects plaintext). Read models show only `••••` + `id_document_last4`; nothing decrypts outside key rotation (`scripts/reencrypt-id-documents.ts`).
- CSP + `X-Frame-Options`/`nosniff`/`Referrer-Policy` headers.

## RBAC — roles & permissions (2026-11-15)

```text
DECISION: Role model
STATUS: accepted
CONTEXT: Hotels need to tune who can do what per feature without code changes; custom roles would need role CRUD and a staff_user migration.
OPTIONS:
  A. Fixed roles + editable matrix — staff_role enum (ADMIN shown as "Super admin", MANAGER, REVENUE_MANAGER, FRONT_DESK, POS); grid edits permissions per role per property.
  B. Custom roles table — flexible, but role CRUD + data migration + PR-03 rewrite.
RECOMMENDATION: A — covers the need at a fraction of the change; B can reuse the same permission keys later.
CONSEQUENCE: Adding a role is an enum migration. ADMIN is immutable (code + DB CHECK) → no lockout.
```

```text
DECISION: Permission storage and granularity
STATUS: accepted
CONTEXT: Defaults must apply to new properties and future keys without data migrations; ALTER TYPE … ADD VALUE can't be used in the same migration transaction.
OPTIONS:
  A. Overrides on code defaults — role_permission(property_id, role, permission, granted) stores only cells that differ from DEFAULT_GRANTS; 23 keys (view/manage per feature + void payment, night audit, CSV export, full audit log, roles.manage).
  B. Materialized matrix — one row per granted cell, seeded per property.
RECOMMENDATION: A — no data migration, "reset" = delete rows, new keys get defaults automatically.
CONSEQUENCE: Effective set = defaults ⊕ overrides, then requires-graph closure (e.g. frontDesk.manage needs folio.view); unknown/locked keys ignored.
```

```text
DECISION: Enforcement point
STATUS: accepted
CONTEXT: Contracts declared role lists; nav hid items separately.
OPTIONS:
  A. Each contract declares exactly one `permission` key (or 'public'); the executor loads effective permissions per call (ADMIN skips the query) and passes them on ctx.
  B. Permissions on the session Actor — every in-memory actor (tests, scripts) changes; grid edits apply only at next login.
RECOMMENDATION: A — one enforcement point, fail-closed, changes apply on the next request.
CONSEQUENCE: Nav, page buttons and page loads read `actor.permissions` from the (app) layout and redirect instead of 403. A test pins every contract → key.
```

## Staff management — PR-03 (2026-11-15)

```text
DECISION: Staff escalation guard
STATUS: accepted
CONTEXT: staff.manage is grantable in the RBAC grid, so "manager may manage staff" must not let anyone mint or control accounts more powerful than themselves.
OPTIONS:
  A. Subset rule — an actor may create/edit/deactivate/reset a user only if that user's role (current and requested) has effective permissions ⊆ the actor's, re-loaded under the property lock.
  B. Fixed role hierarchy (ADMIN > MANAGER > …) — simple, but ignores grid edits (a Front desk granted staff.manage could create Managers).
RECOMMENDATION: A — follows the grid automatically; Super admins (only holders of roles.manage) are manageable only by Super admins.
CONSEQUENCE: Managers can manage other Managers (checkpoint answer). Grid drift is fail-closed. Last active Super admin is protected under the same lock.
```

```text
DECISION: Forced password change and self-service
STATUS: accepted
CONTEXT: Temporary passwords must be replaced before use, and every role (incl. POS with no grid keys) must be able to change its own password.
OPTIONS:
  A. 'authenticated' contract permission + must_change_password gate in authorize() and the (app) layout — one escape route (account.changePassword).
  B. A grid permission for "change own password" — could be unticked, locking users out.
RECOMMENDATION: A — the gate covers every API (403) and page (303 → /account/password) from two choke points.
CONSEQUENCE: Deactivate / reset revoke sessions in the command transaction; own change keeps the current session; login re-checks the hash after creating the session (closes a reset-during-login race).
```

## Operational data reset (2026-11-15)

```text
DECISION: Bypassing append-only triggers for a go-live reset
STATUS: accepted
CONTEXT: Before go-live, demo/test bookings and their ledger rows must be removed per property, but folio_item, folio_payment, folio_item_tax and audit_event are append-only by trigger.
OPTIONS:
  A. Ops script disables the four named triggers inside one transaction (after locking every touched table SHARE ROW EXCLUSIVE), deletes property-scoped rows, re-enables and verifies pg_trigger before commit.
  B. session_replication_role = replica — also disables FK enforcement, which proves the delete order.
  C. A tx-local setting checked by forbid_ledger_mutation() — a permanent bypass any app query could enable.
RECOMMENDATION: A — no standing bypass, FKs stay on, all-or-nothing (DDL is transactional).
CONSEQUENCE: `scripts/reset-operational-data.ts` is CLI-only (never on boot): dry run by default, --confirm <slug>, refuses after any invoice unless --force, operator must be an active Super admin; the property's audit log is replaced by one "Operational data reset" row. The app DB role is a superuser/owner, so the triggers are a guard against bugs, not against a hostile DB user — a least-privilege role is later hardening.
```

## First install — PR-02 (2026-11-15)

```text
DECISION: Production bootstrap instead of demo seed
STATUS: accepted
CONTEXT: The migrate container seeded the demo hotel and demo logins into every empty database, including production; staging runs without Docker.
OPTIONS:
  A. Demo seed opt-in (SEED_DEMO=true) + a bootstrap CLI (bootstrap.mjs / scripts/ops/bootstrap.sh) creating one property, one Super admin with a one-time password, and the night-audit system user; refuses when any property exists unless --allow-existing-properties.
  B. First-run web setup wizard — no shell needed, but an unauthenticated "claim this install" window on a public host.
RECOMMENDATION: A — no unauthenticated window; the password never travels as an argument and must be changed at first sign-in.
CONSEQUENCE: Fresh databases stay empty until someone with shell access bootstraps. A mistyped re-run can't silently create a second hotel. Slug/email races are classified from the unique constraint name (LOCK TABLE property only serialises bootstrap vs bootstrap).
```

## Known gaps / next steps
- OTA adapters are a generic signed-JSON push; real Booking.com/Agoda/Expedia APIs need partner credentials.
- Receipt "PDF" = print-optimised page (browser *Save as PDF*).
- Early check-out does not release unused future nights.
- In-memory rate limiter is per-process; use Redis when horizontally scaling.
