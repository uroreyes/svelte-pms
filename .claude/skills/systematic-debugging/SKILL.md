---
name: systematic-debugging
description: Debugging protocol for the Hotel PMS when a fix already failed once, the bug's layer is unclear, an error recurs, tests pass but Docker/UI misbehaves, or the error message points at the wrong place. Layer map for SvelteKit + CQRS executors + Drizzle/Postgres + Docker, plus this project's known recurring bug patterns.
---

# Systematic debugging

Not for first-attempt bugs you can read and fix (typos, missing imports). For everything that resisted one fix: reproduce → locate the layer → one hypothesis → minimal change → verify.

## 1 · Reproduce first

```
REPRO:
1. docker compose up -d --build        (or: node22 'npx vitest run <file>')
2. <request / click path>   e.g. POST /api/front-desk/check-out {reservationId, releaseUnusedNights:true}
3. Expected: 200 { ok: true, data: { … } }
4. Actual:   409 { ok: false, error: { code: "CONFLICT", message: "…" } }
```
Tools: `curl` through nginx (:8088) with a cookie jar from `POST /login` · `docker compose exec -T db psql -U pms -d pms -c "…"` · `docker compose logs app` · a single vitest file · a Playwright screenshot (`mcr.microsoft.com/playwright:v1.49.0-noble`, `npx playwright screenshot --load-storage=…`).
Can't write the repro → you don't understand the bug yet.

## 2 · Read the whole error

Drizzle wraps Postgres errors: the SQLSTATE is on `err.cause.code` (`pgErrorCode` walks it). `toApiError` maps `23P01` → overlap conflict, `23505` → duplicate, `P0001` → append-only trigger, `23514` → check constraint; anything else is logged as `[<command name>] unhandled error` in `docker compose logs app` and returned as `INTERNAL`.

## 3 · Locate the layer (confirm before fixing)

| Layer | How to confirm |
| --- | --- |
| Contract (Zod) | 422 `VALIDATION` with `details.fields` → `Contract.input.safeParse(raw)` in a test |
| Executor | 401/403 → contract `roles` vs actor role; no transaction / no audit → wrong executor (`staffCommand` vs `staffCommandNoTx`) |
| Handler | `DomainError` thrown with the message you see; add a focused integration test |
| Kernel | locks / inventory / folio totals wrong → assert `room_inventory_daily`, folio totals vs ledger sums |
| Postgres | constraint / trigger / SQLSTATE; run the same SQL in `psql` |
| Endpoint | wrong status / envelope → `endpoint.ts` (`readJsonBody` needs `content-type: application/json`) |
| Client bus | `ApiResult` shape, `NETWORK` errors, query-string encoding in `toSearchParams` |
| Page load / invalidation | stale UI after success → `createAction({ invalidates })` key ≠ `depends('app:<key>')` |
| Svelte reactivity | value frozen at first render → `$state(prop)` captured once (`state_referenced_locally`); use `$derived` or `{#key}` |
| CSS | utility missing → Tailwind 4 `@utility` vs `@layer components`; layout overflow → see patterns below |
| Docker | change not visible → stale image (`docker compose up -d --build app`); migration not applied → `docker compose logs migrate` |

Write the layer down before writing any fix.

## 4 · One hypothesis → minimal change

One sentence, most likely first: *"Payments are computed before the early-departure release, so the balance check fails and the whole transaction rolls back."* Test it with the smallest change (a focused test, a `psql` query, a temporary log). Remove temporary logs before reporting. Wrong → back to step 3; don't stack guesses.

## 5 · Verify (all that apply)

Focused test green · typecheck 0 errors · full suite green (orchestrator) · Docker rebuild + repro from step 1 passes · UI screenshot when visual. A fix that passes tests but fails in Docker isn't a fix.

## Recurring patterns in this project (check these first)

1. **String-replace hit the wrong function** — `executeQuery` and `executeNonTxCommand` share identical lines; edits must assert the occurrence count and re-read the function.
2. **Rollback hides partial work** — a later guard (e.g. balance ≠ 0) rolls back earlier steps in the same command; compute dependent values *after* the step that changes them (`settleWith` pattern).
3. **Business time vs DB clock** — handler uses `ctx.now`, but `posted_at`/`paid_at` default to the real clock; date-filtered reports in tests must use the real date.
4. **Timezone** — timestamps formatted without `timeZone` show server (UTC) time; always `formatDateTime(iso, property.timezone)` / `dateIn`.
5. **Tailwind 4** — `@apply` of a class defined in `@layer components` fails the build; declare it with `@utility`.
6. **Phantom scrollbars** — `overflow-x-auto` + children with `-mb-px` / percentage margins overflow; percentage margins resolve against the container, not the grid cell.
7. **Nullable unique columns** — duplicates slip through unique indexes on NULL; use `NULLS NOT DISTINCT` (hand-written SQL in the migration).
8. **Stale image / migration** — code or schema change not live until `docker compose up -d --build`; check `migrate` exited 0.
9. **Port 8080 taken** on this machine by another project — the stack uses 8088.

## Recurrence

Same class of bug twice = systemic: fix the instance, grep for the pattern across `src/`, fix all, add the test that would have caught it, add the pattern above, and log it in Obsidian (orchestrator).

Report terse: *"Layer: handler. Check-out computed payments before releasing nights, so the balance guard failed and rolled everything back. Fix: `settleWith` pays after release. Test: daily-ops › PR-11."*
