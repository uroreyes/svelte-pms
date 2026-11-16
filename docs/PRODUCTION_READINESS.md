# Production Readiness — Small Hotel PMS

Audit date: 2026-11-15 · Scope: whole repo + Docker stack (`docker compose up`).

**Verdict: not production-ready yet.** The core is solid: double bookings are prevented, the money
ledger can't be altered, and pricing is checked on the server. Six blockers (P0) must be fixed
before real guests and money go through it. The P1 items decide whether front-desk staff can run a
normal week with it.

## How to use this file

- Work item by item: *"fix PR-05"*. Each item has the problem, evidence (`file:line`), a fix plan and done-criteria.
- When an item ships, set its **Status** to `✅ Done (YYYY-MM-DD)` in the index and add a one-line note under the item.
- Line numbers are as of the audit date and will drift; search for the quoted symbol if a line doesn't match.

Severity: **P0** = blocker (security / data loss / money) · **P1** = needed for daily operations · **P2** = hardening.
Effort: **S** < ½ day · **M** 1–2 days · **L** 3+ days.

## Index

| ID | Title | Sev | Effort | Status |
| --- | --- | --- | --- | --- |
| [PR-01](#pr-01--https--tls-termination) | HTTPS / TLS termination | P0 | S | ☐ Open |
| [PR-02](#pr-02--demo-seed-runs-on-every-boot--default-credentials) | Demo seed runs on every boot + default credentials | P0 | S | ✅ Done (2026-11-15) |
| [PR-03](#pr-03--staff-management) | Staff management (users, passwords, deactivate) | P0 | M | ✅ Done (2026-11-15) |
| [PR-04](#pr-04--database-backups--restore) | Database backups & restore | P0 | S | ☐ Open |
| [PR-05](#pr-05--scheduler-for-night-audit-ari-push-ical-sync) | Scheduler: night audit, ARI push, iCal sync | P0 | M | ☐ Open |
| [PR-06](#pr-06--real-ota-connectivity) | Real OTA connectivity | P0 | L | ☐ Open |
| [PR-07](#pr-07--modify-a-reservation) | Modify a reservation | P1 | M | ✅ Done (2026-11-15) |
| [PR-08](#pr-08--room-move-for-in-house-guests) | Room move for in-house guests | P1 | S | ✅ Done (2026-11-15) |
| [PR-09](#pr-09--no-show-processing) | No-show processing | P1 | S | ✅ Done (2026-11-15) |
| [PR-10](#pr-10--overstay-handling) | Overstay handling | P1 | S | ✅ Done (2026-11-15) |
| [PR-11](#pr-11--early-departure-releases-unused-nights) | Early departure releases unused nights | P1 | S | ✅ Done (2026-11-15) |
| [PR-12](#pr-12--booking-guarantee-deposit--cancellation-policy) | Booking guarantee / deposit + cancellation policy | P1 | L | ☐ Open |
| [PR-13](#pr-13--guest-confirmation-emails) | Guest confirmation emails | P1 | M | ☐ Open |
| [PR-14](#pr-14--booking-engine-abuse-protection) | Booking engine abuse protection | P1 | S | ☐ Open |
| [PR-15](#pr-15--multi-room-bookings) | Multi-room bookings | P1 | M | ✅ Done (2026-11-15) |
| [PR-16](#pr-16--rate-plans--occupancy-pricing) | Rate plans & occupancy pricing | P1 | L | ✅ Done (2026-11-15) |
| [PR-17](#pr-17--tax-model) | Tax model (multiple, per-person, inclusive) | P1 | M | ✅ Done (2026-11-15) |
| [PR-18](#pr-18--invoice-numbering--company-billing-details) | Invoice numbering + company billing details | P1 | M | 🟡 Partial (2026-11-15) |
| [PR-19](#pr-19--cashier-report--csv-exports) | Cashier / shift report + CSV exports | P1 | M | ✅ Done (2026-11-15) |
| [PR-20](#pr-20--timestamps-in-hotel-timezone) | Timestamps in hotel timezone | P1 | S | ✅ Done (2026-11-15) |
| [PR-21](#pr-21--encrypt-guest-id-numbers-at-rest) | Encrypt guest ID numbers at rest | P1 | M | ✅ Done (2026-11-15) |
| [PR-22](#pr-22--pii-retention--erasure) | PII retention & erasure | P1 | M | ☐ Open |
| [PR-23](#pr-23--operational-audit-log) | Operational audit log | P1 | M | ✅ Done (2026-11-15) |
| [PR-24](#pr-24--dev-tooling-vulnerabilities) | Dev-tooling vulnerabilities | P2 | S | ☐ Open |
| [PR-25](#pr-25--error-alerting--monitoring) | Error alerting & monitoring | P2 | M | ☐ Open |
| [PR-26](#pr-26--per-account-login-lockout) | Per-account login lockout | P2 | S | ☐ Open |
| [PR-27](#pr-27--webhook-replay-window) | Webhook replay window | P2 | S | ☐ Open |
| [PR-28](#pr-28--ssrf-dns-rebinding) | SSRF DNS-rebinding | P2 | S | ☐ Open |
| [PR-29](#pr-29--ci--end-to-end-tests) | CI + end-to-end tests | P2 | M | ☐ Open |
| [PR-30](#pr-30--svelte-check-warnings) | svelte-check warnings | P2 | S | ☐ Open |

**Progress (2026-11-15):** P1 batch 1 shipped — PR-07, 08, 09, 10, 11, 19, 20 done; PR-18 partial. Tests: 49 passing (13 new integration cases in `src/lib/server/daily-ops.integration.test.ts`). Migration `drizzle/0002_daily_ops.sql`.
P1 batch 2 shipped — PR-15, 16, 17 done (migration `drizzle/0003_taxes_rate_plans_bookings.sql`, 64 tests; new `src/lib/server/pricing.integration.test.ts`).
PR-23 audit log done (70 tests). PR-21 done via agent pipeline (117 tests). RBAC (roles & permissions grid, new Revenue manager role, migration `0006_rbac.sql`) done via agent pipeline — not a PR-xx item; it is the authorization base for PR-03 (151 tests). PR-03 staff management done via agent pipeline (206 tests, migration `0007`). Go-live operational data reset script added (README → Operational data reset; 249 tests). Remaining P1: PR-12 / 13 / 14 (need payment, email and captcha provider decisions), PR-18 credit notes, PR-22.

**Suggested order:** PR-02 → PR-01 → PR-04 → PR-03 → PR-05 → PR-20 → PR-09/10/11 → PR-07/08 → PR-23 → PR-21/22 → the rest.
PR-06 is a business decision (which channel manager) — decide early, build late.

---

## P0 — Blockers

### PR-01 · HTTPS / TLS termination
**Status:** ☐ Open · **Sev:** P0 · **Effort:** S

**Problem.** nginx only serves plain HTTP. Staff passwords and session cookies can be read on the hotel Wi-Fi,
and the session cookie isn't marked `Secure` (it follows the request protocol).

**Evidence.** `docker/nginx/default.conf:19` (`listen 80` only) · `src/routes/login/+page.server.ts:37` (`secure: url.protocol === 'https:'`).

**Fix.**
1. Add a `443 ssl http2` server block; redirect port 80 → 443 (keep `/healthz` on 80 for local probes).
2. Certificates: Let's Encrypt via a `certbot` sidecar (or Caddy in front), or mount existing certs from `./certs`.
3. Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` once HTTPS is verified.
4. Expose `443` in `docker-compose.yml`; keep `X-Forwarded-Proto $scheme`.

**Done when.** `curl -I http://host` → 301 to https · the login cookie has the `Secure` flag · SSL Labs grade ≥ A.

---

### PR-02 · Demo seed runs on every boot + default credentials
**Status:** ✅ Done (2026-11-15) · **Sev:** P0 · **Effort:** S

**Problem.** The migrate container runs `migrate && seed`, so a fresh production database gets the demo hotel
"Harbor House" and 3 demo logins. The current admin password is `admin-pass-123`; the DB password is `pms`.

**Evidence.** `docker/migrate/Dockerfile:38` · `docker-compose.yml:13` (`POSTGRES_PASSWORD:-pms`) · `docker-compose.yml:35`.

**Fix.**
1. Migrate CMD runs `node migrate.mjs` only. Seeding needs explicit opt-in: `SEED_DEMO=true`.
2. Replace the demo seed for production with a **bootstrap** command: `node bootstrap.mjs --property-name … --slug … --admin-email …`.
   It prints a one-time password that must be changed at first login (see PR-03).
3. Make `POSTGRES_PASSWORD` required in compose (`${POSTGRES_PASSWORD:?…}`); document generating it with `openssl rand -hex 24`.
4. Rotate the existing dev credentials before any real use.

**Done when.** `docker compose up` on an empty DB creates **no** property or users · bootstrap creates exactly one property + admin · compose refuses to start without `POSTGRES_PASSWORD`.

**Resolution (2026-11-15).** Migrate CMD runs migrate → re-encrypt and seeds only when `SEED_DEMO=true` (compose default `false`).
`bootstrap.mjs` / `scripts/ops/bootstrap.sh` (no Docker) creates one property + Super admin (`must_change_password`, one-time
password printed once, never an argument) + the night-audit system user, in one transaction with one audit row; refuses when any
property exists (unless `--allow-existing-properties`), on taken slug/email (incl. the unique-violation race) and on reserved
system emails. `POSTGRES_PASSWORD` is `${…:?}` in compose; `.env.example` ships it and `CHANNEL_WEBHOOK_SECRET` empty.
Verified: compose `config` fails without/with empty password; empty DB via compose with SEED_DEMO unset/empty/false → 0 properties,
0 users; `=true` → demo; bootstrap on an empty DB → 1 property, 2 users (admin + system), night audit runs for it; 305 tests.
Remaining (step 4): rotate credentials on each environment before real use — see README "First install".

---

### PR-03 · Staff management
**Status:** ✅ Done (2026-11-15) · **Sev:** P0 · **Effort:** M

**Problem.** There's no screen to add or disable users or to change or reset passwords. Staff turnover needs manual SQL,
and a departed employee keeps access until someone edits the DB.

**Evidence.** The `src/lib/features/setup/` slices cover room types, units, catalog and property only · roles are defined at `src/lib/shared/domain/enums.ts:1`.

**Fix (new `features/staff/` module; gate with a permission key — `MANAGERS` no longer exists since RBAC; add e.g. `staff.manage` to `shared/domain/permissions.ts`, default Super admin + Manager; role picker must include Revenue manager and guard against deactivating the last active Super admin):**
- `create-staff-user` (email, name, role, temp password) · `update-staff-user` (name, role, active)
- `reset-staff-password` (admin sets a temporary password → `must_change_password = true`)
- `change-own-password` (any staff; requires the current password; min 12 chars)
- `get-staff` query · `/staff` page
- Deactivating a user or changing a password **revokes all their sessions** (`DELETE FROM session WHERE user_id = …`).
- Guard: the last active ADMIN cannot be deactivated or demoted.

**Done when.** A manager can onboard and offboard a staff member from the UI · a deactivated user's open session gets 401 on the next request · integration tests cover the last-admin guard and session revocation.

**Resolution (2026-11-15, agent pipeline).** Setup → **Staff** tab (`/setup/staff`, permission `staff.manage`, requires `setup.manage`; default Super admin + Manager) with create / rename / change role / deactivate / reactivate / reset password; `/account/password` for every signed-in user (contract permission `'authenticated'`). Temporary passwords set `must_change_password` → login, every page and every API (403 "Password change required") are blocked until changed. Deactivate and reset revoke all sessions in the same transaction; own change keeps the current session. Escalation guard: you can only manage roles whose effective permissions ⊆ your own, re-checked under the property lock (Super admins only by Super admins); last active Super admin can't be deactivated/demoted (race-tested); no self role change / deactivate / admin-reset. Emails stored lowercase (CHECK); night-audit user flagged `is_system` (CHECK: never active, hidden). Migration `0007_staff_management.sql`. Verified: 206 tests (28 new integration + unit), HTTP smoke — deactivated user's open session → 401 API / 303 /login. Accepted: no per-account throttle on password change (PR-26); global email uniqueness reveals existence to `staff.manage` holders (single-property OK).

---

### PR-04 · Database backups & restore
**Status:** ☐ Open · **Sev:** P0 · **Effort:** S

**Problem.** The ledger and reservations live in one Docker volume with no backup. One disk failure or `docker compose down -v` loses the financial records.

**Evidence.** `docker-compose.yml:18` (`pms_pgdata` volume only).

**Fix.**
1. Add a `backup` service (e.g. `postgres:17-alpine` + crond) running nightly `pg_dump -Fc` to `./backups` with 14 daily / 8 weekly retention.
2. Copy backups off the machine (S3/B2/rclone, or at minimum a different disk).
3. `scripts/restore.sh <dump>` plus a documented, **tested** restore procedure in the README.
4. Optional: WAL archiving for point-in-time recovery.

**Done when.** A nightly dump appears and is copied off-host · a restore into a scratch DB passes a smoke check (row counts, folio totals match).

---

### PR-05 · Scheduler for night audit, ARI push, iCal sync
**Status:** ☐ Open · **Sev:** P0 · **Effort:** M

**Problem.** Nothing runs automatically. The default posting mode is `NIGHTLY`, so room charges never post
unless someone clicks *Run night audit*, and checkout then blocks on unposted nights. ARI pushes and
iCal imports also never run, so OTAs drift out of sync.

**Evidence.** `docker-compose.yml:27` (night audit documented as a manual command) · `src/lib/features/folio/run-night-audit/handler.server.ts:16` · `src/lib/features/channels/process-outbox/handler.server.ts:33`.

**Fix.**
1. Add a `worker` service (reuses the migrate image) with a small loop or `supercronic`:
   - **night audit**: per property, shortly after local midnight (timezone-aware); idempotent already.
   - **ARI outbox**: every 1 min (`FOR UPDATE SKIP LOCKED` already supports concurrent workers).
   - **iCal sync**: every 15 min per mapping with `ical_url`.
2. Bundle the outbox and iCal-sync entry points as `.mjs` (like `night-audit.mjs`), acting as the per-property system user.
3. Log each run; expose the last-run time + status on the Channels page.

**Done when.** Without any clicks: room nights post overnight, outbox rows go `PENDING → SENT` within a minute, iCal mappings show a recent `last_synced_at`.

---

### PR-06 · Real OTA connectivity
**Status:** ☐ Open · **Sev:** P0 · **Effort:** L

**Problem.** Outbound ARI is a generic signed-JSON push and inbound is our own webhook format. Booking.com, Agoda and Expedia
only accept **certified** connectivity partners. Today only iCal works (Airbnb / small OTAs), with a sync delay, so overbookings will happen.

**Evidence.** `src/lib/features/channels/process-outbox/ari.server.ts` (generic adapter) · `src/lib/features/channels/ingest-ota-webhook/contract.ts` (own payload).

**Fix (decide first).**
- **Option A — integrate a certified channel manager** (e.g. SiteMinder, Channex, Cloudbeds, eviivo). Implement one `ChannelAdapter`
  for its ARI API + map its reservation webhook into `IngestOtaReservation`. Recommended: weeks of work, not months.
- **Option B — direct OTA certification**: months per OTA; not realistic for a small team.
- Either way: add a **MODIFY** event (dates/room change) to the ingest slice, alongside NEW and CANCEL.

**Done when.** A test booking made on a real OTA sandbox shows up in the PMS within a minute and deducts inventory · a rate/availability change in the PMS shows on the OTA extranet.

---

## P1 — Daily operations

### PR-07 · Modify a reservation
**Status:** ✅ Done (2026-11-15) · **Sev:** P1 · **Effort:** M

**Problem.** Dates, room type and guest count can't be changed — only cancel and rebook, which issues a new confirmation code at current rates.

**Evidence.** No modify slice in `src/lib/features/reservations/`; only `cancel-reservation`.

**Fix.** New `modify-reservation` command (CONFIRMED only; CHECKED_IN = change check-out only):
lock old + new inventory rows in one consistent order (by date) → release removed nights / consume added nights →
re-quote the added nights only (existing nights keep the snapshot rate unless "reprice" is ticked) → keep the confirmation code →
enqueue ARI for the union of the old and new ranges. Re-validate the room allocation (exclusion constraint).

**Done when.** Extending, shortening, shifting and changing room type all work with correct inventory counts · concurrency test: a modify and a booking racing for the last unit · the confirmation code is unchanged.

**Resolution.** `reservations/modify-reservation` keeps the code, moves inventory via `moveInventory` (room types locked in id order), and keeps booked rates unless *re-price* is ticked; a room-type change re-prices and unassigns the room. In-house guests: departure and party only.

---

### PR-08 · Room move for in-house guests
**Status:** ✅ Done (2026-11-15) · **Sev:** P1 · **Effort:** S

**Problem.** A checked-in guest can't be moved (AC broken, upgrade).

**Evidence.** `src/lib/features/reservations/assign-room/handler.server.ts:11` (`Rooms can only be (re)assigned before check-in`).

**Fix.** `move-room` command for CHECKED_IN: the target room must be CLEAN/INSPECTED and free for [today, check_out); the old room becomes DIRTY;
future room-charge descriptions use the new room number. If the room type changes, move inventory for the remaining nights (reuse PR-07 logic).

**Done when.** The tape chart shows the stay on the new room from today · the old room is marked dirty · folio continuity is kept.

**Resolution.** `reservations/move-room` for CHECKED_IN guests: target must be clean and free until departure; a room-type change moves the remaining nights' inventory; old room → DIRTY; the move is noted on the reservation. Booked rates are kept (complimentary upgrade).

---

### PR-09 · No-show processing
**Status:** ✅ Done (2026-11-15) · **Sev:** P1 · **Effort:** S

**Problem.** Guests who never arrive stay `CONFIRMED` forever, keep holding inventory and clutter arrivals.

**Evidence.** The `NO_SHOW` status exists but nothing sets it (only referenced in `TapeChart.svelte`).

**Fix.** The night audit (or a `mark-no-show` command) flags CONFIRMED reservations with `check_in < business date` → `NO_SHOW`,
releases the remaining nights, enqueues ARI, and optionally posts a no-show fee per policy (ties into PR-12).

**Done when.** After the audit, yesterday's unarrived bookings are NO_SHOW, inventory for the remaining nights is released, and the event is attributed (PR-23).

**Resolution.** The night audit marks CONFIRMED arrivals dated *before* the business date as NO_SHOW (`no_show_at`) and releases their inventory and ARI. Manual *Mark no-show* on the reservation and Front desk pages. No-show fee is deferred to PR-12.

---

### PR-10 · Overstay handling
**Status:** ✅ Done (2026-11-15) · **Sev:** P1 · **Effort:** S

**Problem.** A guest still checked in after their check-out date isn't charged: the night audit only posts while `check_out > date`, so those nights are free.

**Evidence.** `src/lib/features/folio/run-night-audit/handler.server.ts:16` (`gt(reservation.checkOut, date)`).

**Fix.** The night audit lists overstays (CHECKED_IN and `check_out <= business date`) → a front-desk alert. The resolution is an extension (PR-07) or checkout.
Don't auto-post without a reservation night/rate.

**Done when.** Overstays appear on the Front desk page with a one-click "extend 1 night" · no night goes unbilled silently.

**Resolution.** Daily ops exposes `overstays` with a one-click *Extend* (modify, departure = tomorrow); the night audit reports the overstay count. Nothing is auto-posted without a booked night.

---

### PR-11 · Early departure releases unused nights
**Status:** ✅ Done (2026-11-15) · **Sev:** P1 · **Effort:** S

**Problem.** Checking out early either blocks (unposted future nights) or forces billing the full stay; the unused nights are never released back to inventory.

**Evidence.** `src/lib/features/front-desk/check-out/handler.server.ts:19` (blocks on any unposted night).

**Fix.** Checkout gets an option `earlyDeparture: { chargeRemaining: boolean }`. If false: set `check_out = business date`, delete the future
`reservation_night` rows (not ledger rows), release inventory for them, enqueue ARI. Requires FRONT_OFFICE + reason (audit log).

**Done when.** Leaving a 5-night stay on night 2 frees nights 3–5 on the inventory grid and the OTAs.

**Resolution.** Check-out option `releaseUnusedNights`: shortens the stay to today (always keeps the first night), voids posted room charges for released nights, releases inventory and ARI. New `settleWith` pays any remaining balance or refunds a credit against the folio's own payments, in the same transaction.

---

### PR-12 · Booking guarantee / deposit + cancellation policy
**Status:** ☐ Open · **Sev:** P1 · **Effort:** L

**Problem.** Direct bookings are "pay at hotel" with no card guarantee, deposit or cancellation terms, so there's no protection against no-shows.

**Evidence.** `src/routes/book/[property]/+page.svelte:118`.

**Fix.**
- `cancellation_policy` on the property / rate plan (free until N days, then X% or first night).
- Payment provider integration (Stripe / Adyen / local PSP) with **hosted fields or a redirect only** — never store card data (keeps PCI scope at SAQ-A).
- Deposit captured at booking → posted as a folio payment at check-in; card token kept for no-show fees.

**Done when.** A booking requires a guarantee per policy · a cancellation inside the window posts the right fee · no PAN ever touches our servers.

---

### PR-13 · Guest confirmation emails
**Status:** ☐ Open · **Sev:** P1 · **Effort:** M

**Problem.** Guests get no confirmation, modification or cancellation email, and staff can't email a folio receipt.

**Fix.** A mail outbox table (same transactional-outbox pattern as ARI) + a worker using SMTP/Resend/Postmark. Templates: confirmation, modification,
cancellation, pre-arrival, receipt. Store the send status per reservation.

**Done when.** A direct booking triggers an email within a minute · a failed send retries and surfaces on the reservation page.

---

### PR-14 · Booking engine abuse protection
**Status:** ☐ Open · **Sev:** P1 · **Effort:** S

**Problem.** At 5 bookings per minute per IP and with no captcha, a script can block real inventory with fake bookings.

**Evidence.** `src/routes/api/public/bookings/+server.ts:5`.

**Fix.** Turnstile/hCaptcha on the booking form (verified server-side in `create-booking`) · cap on active unguaranteed bookings per email/phone ·
optionally auto-expire unguaranteed holds (ties to PR-12).

**Done when.** A scripted booking without a captcha token is rejected · a repeat-email cap is enforced.

---

### PR-15 · Multi-room bookings
**Status:** ✅ Done (2026-11-15) · **Sev:** P1 · **Effort:** M

**Problem.** One room per booking. Families and groups need two rooms under one confirmation.

**Fix.** A `booking` parent (confirmation code, guest, payment) with N `reservation` children; consume inventory for all rooms in one transaction (lock order: room type id, then date).
Folio stays per reservation, with an optional "pay all" on the parent.

**Done when.** A 2-room direct booking either fully succeeds or fully fails · both rooms show on the tape chart under one code.

**Resolution.** New `booking` parent (one guest, one booking code) with 1–5 `reservation` children; `booking-engine/create-booking` takes `rooms[]`, processes them in room-type order (consistent locks) inside one transaction, so all rooms succeed or none do, and checks the expected total for the whole booking. Confirmation lookup works by booking or room code; the reservation page lists the group's rooms; search matches booking codes. Tests: atomic failure + 3-way concurrent multi-room race. *Deferred:* a "pay all" action across the group's folios.

---

### PR-16 · Rate plans & occupancy pricing
**Status:** ✅ Done (2026-11-15) · **Sev:** P1 · **Effort:** L

**Problem.** One price per room type per day. There are no non-refundable or breakfast-included plans, no extra-adult or child charges, and no length-of-stay discounts — standard for OTA distribution.

**Evidence.** `src/lib/server/domain/inventory.ts:32` (`rateOverrideCents ?? baseRateCents`).

**Fix.** A `rate_plan` table (room type, name, policy, inclusions, derived-from + % / fixed adjustment) · `rate_plan_daily` overrides ·
occupancy rules (included guests, extra adult/child price) · the quote engine takes (room type, plan, party) · reservation stores the plan id · channel mapping per plan.

**Done when.** The booking engine shows ≥ 2 plans per room with correct totals · OTA mapping is per plan.

**Resolution.** `rate_plan` (± % / ± fixed vs. the day rate, included occupancy, extra adult/child, refundable + free-cancellation days, breakfast, plan MinLOS, default flag) + `rate_plan_daily` (per-date override / stop-sell via `inventory/bulk-update-rate-plan`). Pure pricing in `shared/domain/pricing.ts`. The booking engine and front desk sell (room type × plan); reservations store `rate_plan_id`; modify re-prices on plan/party/type change; channel mappings carry `rate_plan_id` + `external_rate_id`, and ARI pushes plan prices. Migration 0003 gives every room type a "Standard rate" plan that reproduces existing prices.

---

### PR-17 · Tax model
**Status:** ✅ Done (2026-11-15) · **Sev:** P1 · **Effort:** M

**Problem.** A single percentage tax per property. Many destinations need several taxes (VAT + service charge + city tax), per-person-per-night levies and tax-inclusive display.

**Evidence.** `src/lib/server/db/schema.ts:59` (`tax_rate_bp`).

**Fix.** A `tax_rule` table (name, type: percent | fixed-per-night | fixed-per-person-night, applies-to: room/F&B/all, inclusive flag, order/compounding).
Folio lines store a per-tax breakdown (`folio_item_tax`) so receipts list each tax. Migrate the existing `tax_rate_bp` → one percent rule.

**Done when.** A receipt shows each tax separately · city tax scales with guests × nights · inclusive pricing back-calculates the net correctly.

**Resolution.** `tax_rule` (PERCENT exclusive/inclusive, PER_NIGHT, PER_PERSON_NIGHT; scope ROOM/POS/ALL; no compounding) + append-only `folio_item_tax` breakdown (reversals/transfers mirror it). Pure engine `shared/domain/tax.ts`; inclusive taxes back-calculate so the total equals the sticker price exactly. Receipt and ledger show per-tax totals. Migration 0003 converts each property's `tax_rate_bp` into a rule and zeroes the legacy column.

---

### PR-18 · Invoice numbering + company billing details
**Status:** 🟡 Partial (2026-11-15) · **Sev:** P1 · **Effort:** M

**Problem.** Receipts have no sequential invoice number (legally required in many countries), and company folios can't carry a tax ID or billing address.

**Evidence.** `src/lib/server/db/schema.ts:249` (`folio` has only `label`, `payer_name`).

**Fix.** On settlement, assign a gap-free number from a per-property sequence (a counter row locked `FOR UPDATE`, **not** a Postgres SEQUENCE, which can leave gaps) ·
add `billing_address`, `tax_id`, `company_name` on the folio · a corrections workflow = credit note referencing the original invoice (never edit).

**Done when.** Every settled folio has a unique consecutive number · a credit note references its invoice · the receipt PDF shows company details.

**Resolution.** Gap-free invoice numbers (`invoice_counter` row lock; `INV-000001` style via `property.invoice_prefix`) are assigned in the check-out transaction to every folio with activity, so a failed check-out consumes no number. Folio company name, tax ID and billing address (`folio/update-folio-billing`) are editable until settlement and printed on the receipt. **Still open:** credit notes for corrections after settlement.

---

### PR-19 · Cashier report + CSV exports
**Status:** ✅ Done (2026-11-15) · **Sev:** P1 · **Effort:** M

**Problem.** There's no end-of-shift cashier report (payments by method and staff) and no export for the accountant.

**Fix.** A `get-cashier-report` query (date range, staff, method → totals + lines, including refunds/voids) · CSV export endpoints for
payments, folio items, reservations, and daily revenue (the KPIs already exist).

**Done when.** A cashier report for a shift reconciles to the sum of folio payments · CSVs open cleanly in Excel (UTF-8 BOM, ISO dates).

**Resolution.** `reports/get-cashier-report` (`/reports`, front office): lines plus totals by method and staff, in hotel-timezone business dates. `reports/export-dataset` → `GET /api/reports/export?dataset=payments|folio-items|reservations` (managers): UTF-8 BOM, ISO dates, formula-injection guard.

---

### PR-20 · Timestamps in hotel timezone
**Status:** ✅ Done (2026-11-15) · **Sev:** P1 · **Effort:** S

**Problem.** Folio timestamps are formatted in the container's timezone (UTC), not the hotel's, so posting times look wrong on screen and on receipts.

**Evidence.** `src/lib/features/folio/ui/FolioLedger.svelte:31` (`toLocaleString` without `timeZone`).

**Fix.** Include `timezone` in the ledger and receipt read models; format every timestamp with `Intl.DateTimeFormat(…, { timeZone })` via a shared helper.

**Done when.** A charge posted at 21:00 Manila time shows 21:00 on screen and on the receipt, whatever the server TZ.

**Resolution.** `formatDateTime` / `dateIn` in `shared/domain/dates.ts`; the ledger read model carries `timezone`; ledger, receipt and cashier report format with the hotel timezone.

---

### PR-21 · Encrypt guest ID numbers at rest
**Status:** ✅ Done (2026-11-15) · **Sev:** P1 · **Effort:** M

**Problem.** Passport / ID numbers are stored in plain text in the DB and backups; only the UI masks them.

**Evidence.** `src/lib/server/db/schema.ts:166` (`id_document_number text`).

**Fix.** Envelope encryption (AES-256-GCM, key from env/KMS, key id stored with the ciphertext) in a `server/security/crypto.ts` used by the check-in handler ·
store `last4` separately for display · a migration encrypts existing rows · key-rotation script.

**Done when.** `SELECT id_document_number` returns ciphertext · the UI still shows `••••1234` · rotation re-encrypts without downtime.

**Resolution.** Built through the agent pipeline (architect → design audit → 3 waves / 11 packages → security, conventions, acceptance audits → 2 amend groups → clean delta). AES-256-GCM envelope `v1:<keyId>:<iv>:<tag>:<ct>` in `guest.id_document_number` (`src/lib/server/security/crypto.ts`), AAD `guest:<guestId>`, random 12-byte IV; `id_document_last4` for display (`shared/domain/id-document.ts`); the reservation read model no longer loads the ciphertext and nothing decrypts outside rotation. Key via `PII_ENCRYPTION_KEY` (+ `PII_ENCRYPTION_PREVIOUS_KEYS` keyring), injected through `makeCheckIn(piiKeyring)`. Migration `0005_encrypt_id_documents` adds last4 + a NOT VALID envelope CHECK; `scripts/reencrypt-id-documents.ts` (run by the migrate container) backfills, rotates with `FOR UPDATE SKIP LOCKED`, validates the CHECK; exit 0/1/2. Verified: 117 tests (47 new), live check-in stores ciphertext and shows `••••1234`, live rotation moved 5 rows to a new key. Caveat: loading a new key recreates the single app container (~10 s of 502s) — re-encryption itself is online; zero-downtime restarts need a second app replica (deploy-infra follow-up).

---

### PR-22 · PII retention & erasure
**Status:** ☐ Open · **Sev:** P1 · **Effort:** M

**Problem.** There's no retention policy or erasure workflow, which privacy laws (GDPR / local Data Privacy Acts) require.

**Fix.** A retention setting (e.g. anonymise guest PII N months after checkout, keep ledger amounts) · a scheduled anonymiser (PR-05 worker) ·
a manual "erase guest" command for data-subject requests (anonymises the guest row; ledger rows stay immutable and reference the anonymised guest).

**Done when.** Guests older than the policy show "Anonymised" · the folio totals still reconcile · the erasure is recorded in the audit log.

---

### PR-23 · Operational audit log
**Status:** ✅ Done (2026-11-15) · **Sev:** P1 · **Effort:** M

**Problem.** Only folio lines and payments record which staff member did them. Cancellations, rate and inventory changes, check-ins, room
assignments and housekeeping changes aren't attributed, so disputes can't be investigated.

**Evidence.** `src/lib/server/domain/reservations.ts:169` (`cancelledAt` set, no `cancelledBy`).

**Fix.** An append-only `audit_event` table (actor, property, command name, entity, entity id, input summary, at) written by
`executeCommand`/`executeNonTxCommand` **inside the same transaction** — one change covers every slice. Redact PII fields. Add a MANAGERS-only viewer.

**Done when.** Every successful command produces exactly one audit row · rolled-back commands produce none · the viewer can filter by reservation.

**Resolution.** Append-only `audit_event` (migration `0004_audit_log.sql`, UPDATE/DELETE/TRUNCATE triggers). `recordAudit` runs inside `executeCommand` / `executePublicCommand` (same transaction) and after `executeNonTxCommand`, so every slice, script and public command is covered with no per-slice code; queries are never logged. Entity and reservation are derived from well-known id fields (folio, line and payment commands resolve to their reservation). PII (guest names, email, phone, ID number, payer, tax ID, address, notes) is redacted; payment references keep the last 4 characters. Sign-in, failed sign-in and sign-out are logged too. Viewer: Reports → Audit log (managers; staff/action/date filters, paging); every reservation has a History section (front office). Tests: `src/lib/server/audit.integration.test.ts` + `audit/record.test.ts`.

---

## P2 — Hardening

### PR-24 · Dev-tooling vulnerabilities
**Status:** ☐ Open · **Sev:** P2 · **Effort:** S

**Problem.** `npm audit` reports 2 critical (`vitest`, `tinypool`) and 5 moderate (`drizzle-kit` → `@esbuild-kit/*`, `esbuild` dev server, `@vitest/mocker`) issues.
All are **dev-only**: the app image has no `node_modules`, and migrate ships only esbuild bundles.

**Evidence.** `package.json:37` (`vitest`).

**Fix.** Upgrade vitest to the patched major; upgrade drizzle-kit once it drops `@esbuild-kit`; add `npm audit --omit=dev --audit-level=high` to CI (PR-29).

**Done when.** `npm audit` shows no high or critical issues.

---

### PR-25 · Error alerting & monitoring
**Status:** ☐ Open · **Sev:** P2 · **Effort:** M

**Problem.** Logs only go to the console (`console.error`). There's no error alerting or uptime monitoring, so a 2 a.m. failure goes unnoticed until check-in.

**Evidence.** `src/lib/server/cqrs/errors.ts:47`.

**Fix.** Structured JSON logs (pino) with request id + command name · Sentry (or GlitchTip, self-hosted) in `handleError` · an uptime probe on `/healthz` ·
alerts on outbox `FAILED` rows and failed night audits.

**Done when.** A thrown error in a handler reaches the alert channel within a minute, with the command name and request id.

---

### PR-26 · Per-account login lockout
**Status:** ☐ Open · **Sev:** P2 · **Effort:** S

**Problem.** Brute-force protection is per IP address only (nginx + in-memory limiter), so a distributed attack on one account isn't slowed.

**Evidence.** `src/routes/login/+page.server.ts:32` · `src/lib/server/security/rate-limit.ts:5`.

**Fix.** A `failed_login_count` + `locked_until` on `staff_user` with exponential backoff · reset on success · optional TOTP 2FA for ADMIN/MANAGER.

**Done when.** 10 bad passwords from rotating IPs lock the account for 15 minutes.

---

### PR-27 · Webhook replay window
**Status:** ☐ Open · **Sev:** P2 · **Effort:** S

**Problem.** The OTA webhook verifies the HMAC but has no timestamp, so a captured request can be replayed. Idempotency on `external_ref` limits the impact, but a replayed CANCEL after a re-book could still cancel.

**Evidence.** `src/routes/api/public/channels/webhook/+server.ts:16`.

**Fix.** Sign `timestamp + "." + body`; reject if more than 5 minutes off · store processed delivery ids for 24 hours.

**Done when.** Replaying a valid request after 5 minutes returns 401.

---

### PR-28 · SSRF DNS-rebinding
**Status:** ☐ Open · **Sev:** P2 · **Effort:** S

**Problem.** `assertPublicHttpsUrl` resolves DNS, then `fetch` resolves again — a rebinding domain can pass the check and then hit an internal address.

**Evidence.** `src/lib/server/security/safe-url.ts:44`.

**Fix.** Use an undici `Agent` with a custom `connect.lookup` that validates the **resolved IP at connect time** (or connect to the vetted IP with the SNI/Host header set).

**Done when.** A test with a rebinding resolver is blocked.

---

### PR-29 · CI + end-to-end tests
**Status:** ☐ Open · **Sev:** P2 · **Effort:** M

**Problem.** There's no CI and no end-to-end UI tests; regressions in pages (like the tape-chart offset bug found during build) are only caught by eye.

**Fix.** GitHub Actions: `npm ci` → `npm run check` → unit + integration tests (Postgres service container) → `docker build` for all 3 images →
Playwright E2E for the golden paths (login, book, check-in, post charge, checkout, POS lookup).

**Done when.** Every PR runs the pipeline green · the E2E suite covers the 6 golden paths.

---

### PR-30 · svelte-check warnings
**Status:** ☐ Open · **Sev:** P2 · **Effort:** S

**Problem.** 37 `state_referenced_locally` warnings. They're intentional (forms seeded from initial props), but the noise hides real warnings.

**Fix.** Wrap the intentional captures with `untrack(() => …)` or add `// svelte-ignore state_referenced_locally` with a reason; fail CI on new warnings.

**Done when.** `npm run check` reports 0 errors, 0 warnings.

---

## What is already solid (keep it that way)

- **No double booking:** `SELECT … FOR UPDATE` in date order; proven by an 8-way concurrent test.
- **Room clashes:** a DB exclusion constraint prevents overlapping room allocations (`drizzle/0001_invariants.sql`).
- **Ledger:** append-only, enforced by triggers; voids are reversal rows; folio totals are updated in the same transaction.
- **Pricing:** server-side re-quote rejects stale client prices; rates are snapshotted per night at booking.
- **Access:** tenant isolation, per-contract roles, and POS staff can't read guest PII.
- **Webhook:** HMAC-verified.
- **Security headers:** CSP, frame blocking, nosniff.
- **Containers:** non-root slim images, health checks, transactional outbox for ARI.
