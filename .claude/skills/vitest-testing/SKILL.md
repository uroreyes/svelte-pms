---
name: vitest-testing
description: Vitest runner conventions for the Hotel PMS — config, imports, file naming, running tests through Docker, time handling, and unit-test patterns for pure rules in src/lib/shared/domain and other pure helpers. Load for any test work; pair with slice-integration-testing when the test touches the database.
---

# Vitest in this repo

Runner conventions + unit tests for **pure** code. Database-backed tests → `slice-integration-testing`.

## Config (already in place — don't add another config file)

`vite.config.ts` → `test: { include: ['src/**/*.test.ts'], environment: 'node', testTimeout: 20_000, hookTimeout: 60_000 }`, with the SvelteKit plugin so `$lib/*` resolves. No globals, no jsdom, no `@testing-library/*` (not installed — adding them is a dependency decision for the checkpoint).

## Files and naming

- Pure rules: colocated `<file>.test.ts` (e.g. `src/lib/shared/domain/tax.test.ts`, `features/reservations/get-tape-chart/layout.test.ts`, `server/audit/record.test.ts`).
- DB-backed: `src/lib/server/<area>.integration.test.ts` (one file per area: `pms`, `daily-ops`, `pricing`, `audit`, …).
- `.test.ts` only — no `.spec.ts`, no `__tests__/`.

## Imports

```ts
import { describe, expect, it } from 'vitest';
import { applyTaxes, type TaxRule } from './tax';
```
Explicit imports only. `vi` only when genuinely needed (see below).

## Running (WSL has no Node — PROJECT_CONTEXT §6)

```sh
node22() { docker run --rm -v "$PWD":/app -v pms_node_modules:/app/node_modules -w /app --network svelte-app_default -e TEST_DATABASE_URL=postgres://pms:pms@db:5432/pms_test node:22-alpine sh -c "$1"; }
node22 'npx vitest run src/lib/shared/domain/tax.test.ts'     # one file
node22 'npx vitest run src/lib/shared'                         # a folder
```
Full suite + test-DB migration is an orchestrator step.

## Time

- Business code takes time from `ctx.now` (handlers) or explicit arguments (`todayIn(tz, now)`, `businessDate(p, now)`). **Pass a fixed `Date` instead of faking timers.**
- Timezone/DST: assert with explicit IANA zones (`Asia/Manila`, `America/Los_Angeles`, `UTC`) and instants near midnight.
- `vi.useFakeTimers()` only for code that truly reads the clock with no injection point — always `vi.useRealTimers()` in `afterEach`.

## Pure-rule test patterns

- **Money:** exact integer cents with `toBe` / `toEqual`. Cover rounding half-away-from-zero, negative mirrors (reversals/discounts), inclusive-tax back-calculation where `net + tax === price` exactly.
- **Dates:** half-open stays (`nightsOf('2026-05-10','2026-05-12')` → 2 nights), month/leap-year bounds, DOW filters, back-to-back non-overlap.
- **Pricing/availability:** each verdict reason (`SOLD_OUT`, `CLOSED`, `MIN_LOS`, `PLAN_CLOSED`, `OCCUPANCY`) has its own case.
- **Parsers/serializers** (iCal, CSV): round-trip + hostile input (folded lines, missing fields, formula injection `=…`).
- Table-style cases are fine: `for (const ip of [...]) expect(isPrivateAddress(ip), ip).toBe(true)` — pass the case as the message.

## Structure

```ts
describe('tax engine', () => {
	it('back-calculates price-inclusive taxes so the total equals the sticker price', () => { … });
});
```
Name the observable behaviour, not the function. Group by behaviour area.

## Mocks

Pure code needs none. `vi.spyOn` / `vi.stubEnv` are acceptable only at true boundaries (e.g. `console.error` noise, an env-reading adapter) — never on `$lib/server/db`, Drizzle, postgres.js or kernel functions (that's what `slice-integration-testing` is for). Restore everything you stub.

## Bad tests

| Pattern | Fix |
| --- | --- |
| `toBeTruthy()` on money or ids | exact value |
| Snapshot of a ledger / quote | explicit fields |
| Testing a private helper's internals | test the exported behaviour |
| Same case copy-pasted 5× | table of cases |
| Asserting only that "it doesn't throw" | assert the output |
