---
name: verification-before-completion
description: Mandatory final gate for the Hotel PMS before saying "done", marking a PR-xx item complete, clearing an audit lane, or updating the readiness doc. Evidence-only checklist — typecheck, targeted and full tests, Docker rebuild with migrations, HTTP smoke through nginx, UI screenshot at 1263 px, DB checks, and docs/Obsidian updates.
---

# Verification before completion

**Claims need evidence.** "Should work", "tests probably pass", or a green test name you didn't read is not evidence. Each claim gets a command and its output.

## 1 · Scope

- What exactly was required (PR-xx **Done when** lines, handover `acceptance`, or the user's request).
- Which layers changed: contract · handler · kernel · schema/migration · route · page-load · slice UI · Docker/nginx.

## 2 · Evidence per layer (run what applies)

| Changed | Evidence |
| --- | --- |
| Any TS/Svelte | `node22 'npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json'` → **0 errors** (warnings: only intentional `state_referenced_locally`) |
| Pure rule | its `*.test.ts` green |
| Handler / kernel | the area's `*.integration.test.ts` green; an assertion exists for every acceptance line (read it) |
| Schema | migration file present (incl. hand-written triggers / data migration); test DB migrated; `\d <table>` in `psql` shows it |
| Whole change | full suite green (orchestrator): `node22 'DATABASE_URL=$TEST_DATABASE_URL npx drizzle-kit migrate && npx vitest run'` |
| Deployable | `docker compose up -d --build` → `migrate` exited 0 (`docker compose logs migrate`), `app` + `nginx` healthy, `curl :8088/healthz` → `{"ok":true}` |
| API | `curl` through nginx with a session cookie: status + `{ ok, data | error }` envelope; wrong role → 403; other tenant → 404 |
| UI | page returns 200 and a screenshot at **1263 px** wide shows no horizontal scroll, nav on one line, error states visible |
| Data | `psql` query proving the invariant (sold counts, folio total = ledger sum, audit row present, no partial rows after failure) |

## 3 · Log each criterion

```
CRITERION: <exact acceptance line>
RAN:       <command / request / screenshot>
OUTPUT:    <exact result — counts, status, ids, cents>
RESULT:    PASS | FAIL
```
Any FAIL → not done. Fix or report it; never round a FAIL up.

## 4 · Close-out (orchestrator)

- `docs/PRODUCTION_READINESS.md`: status → `✅ Done (date)` or `🟡 Partial` + **Resolution** line naming what's still open.
- Obsidian: append to `log/YYYY-MM.md`, update `context.md` status, `pending-deploys.md` (local-only work), `index.md`, and `conventions.md` for any new lasting rule.
- Report honestly: tests run and their counts, what was verified live, what wasn't verified and why, known gaps.

## Auditor use

A lane is `clean: true` only when each checklist item has a concrete look behind it (grep hit, line read, assertion read, command output). Absence of a quick finding is not a clean lane.
