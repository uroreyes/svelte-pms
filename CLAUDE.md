# Hotel PMS & Guest Folio — `CLAUDE.md`

Small-hotel property management system: inventory & rates, reservations, front desk, guest folio, POS, booking engine, channel manager, insights.
SvelteKit 2 (Svelte 5) · TypeScript strict · Tailwind 4 · PostgreSQL 17 · Drizzle · Zod 4 · Vitest · Docker Compose (nginx on :8088).

**Read first:** `.claude/agents/specs/PROJECT_CONTEXT.md` — code map, architecture rules, data invariants, Docker commands, shared formats. It is the single source of truth for agents and the main session; this file only governs *how* work is run.

| Doc | Purpose |
| --- | --- |
| `hotel_pms_guest_folio_project_specification.md` | Product spec |
| `docs/ARCHITECTURE.md` | Accepted decisions (vertical slices + CQRS) |
| `docs/PRODUCTION_READINESS.md` | Backlog PR-01…PR-30 with status, fix plan and **Done when** |
| `README.md` | Run, test, deploy |

---

## 1 · Agent pipeline (QuadA-P)

Agents live in `.claude/agents/`. The main session is the **orchestrator**: it dispatches agents, runs the verification commands, and owns docs + memory.

| Agent | Model | Role |
| --- | --- | --- |
| `architect` | opus | Plans: writes `.claude/agents/specs/handover.md` (work packages, waves). Never writes code. |
| `auditor` | sonnet | Read-only review in lanes: `design` (the plan) · `security` · `conventions` · `acceptance` · `delta` (after fixes). |
| `artisan` | sonnet (per package: haiku/sonnet) | Implements exactly one package. |
| `unit-tester` | sonnet | Unit tests for pure rules; integration tests against the real test DB (no DB mocks). |
| `amender` | sonnet | Applies one group of auditor findings. |

Security review is the auditor's `security` lane (no separate security-analyst agent).

```text
[request] → 1 architect ─► handover.md ─► CHECKPOINT (user answers Questions, approves Deps)
          → 2 auditor:design
          → 3 artisans + unit-testers, wave by wave (parallel within a wave)
          → 4 orchestrator: typecheck · full test suite · docker compose up -d --build
          → 5 auditor:security | conventions | acceptance   (parallel)
          → 6 amenders (one per finding group) → 7 auditor:delta   (repeat 6–7 until clean)
          → 8 orchestrator: verification-before-completion · readiness doc · Obsidian log
```

**When to use it**
- **COMPLEX** — new slice(s), schema change, kernel change (`src/lib/server/domain/*`), money/tax/locking logic, or any PR-xx item → run the pipeline.
- **SIMPLE** — single-file UI/copy/style fix, no new slice, no schema change → main session edits directly, then `verification-before-completion`.
- Unsure → ask the architect; it exits early with "SIMPLE" when that's the case.

Orchestrator-only steps: `drizzle-kit generate`, `npm install`, full test suite, `docker compose`, editing `docs/*`, Obsidian notes, and appending hand-written SQL that packages report in `notes`.

---

## 2 · Skills (`.claude/skills/<name>/SKILL.md`)

| Skill | Used by | When |
| --- | --- | --- |
| `brainstorming` | architect · auditor(design) · amender | ambiguity, competing designs, spec vs invariant conflict, failed attempt |
| `writing-and-executing-plans` | architect (writing) · artisan, unit-tester, amender (executing) | decomposing work · executing a package |
| `vitest-testing` | unit-tester · auditor(acceptance) | any test work; pure-rule unit tests |
| `slice-integration-testing` | unit-tester · auditor(acceptance) | tests touching handlers, kernel, constraints, triggers |
| `systematic-debugging` | artisan · unit-tester · amender · main session | a check failed twice, recurring bug, Docker ≠ tests |
| `verification-before-completion` | everyone | before saying done / clean — always last |
| `dataviz` (global) | artisan · main session | charts and KPI tiles |

A new skill needs `name` + `description` frontmatter and a row here and in `PROJECT_CONTEXT.md` §8.

---

## 3 · Engineering standards

1. **Stack:** SvelteKit 2 + Svelte 5 runes, Tailwind 4 (`@utility` for shared classes), TypeScript `strict` with explicit types — no `any`, no unexplained `@ts-ignore`.
2. **Architecture:** vertical slices + CQRS exactly as in `PROJECT_CONTEXT.md` §4 — commands `POST` / one transaction / ack only; queries `GET` / read models; handlers get `ctx.db`; tenant scoping on every lookup; audit is automatic.
3. **Data:** invariants in `PROJECT_CONTEXT.md` §5 are non-negotiable (cents, half-open stays, lock order, append-only ledger and audit, server-side pricing, gap-free invoices).
4. **Errors:** throw `DomainError` helpers (`invalid` / `forbidden` / `notFound` / `conflict`); never return raw Postgres errors; UI shows `ErrorNote`.
5. **Code quality:** functional and declarative; small single-purpose modules and components; reuse the kernel instead of re-implementing locking, pricing, tax, folio or invoice logic.
6. **Tests:** pure rules → colocated `*.test.ts`; slices → integration tests through the executors against the real test DB. Every PR-xx **Done when** line gets an assertion.
7. **Tooling:** WSL has no Node — every node command runs in Docker (`PROJECT_CONTEXT.md` §6). npm with exact pinned versions.
8. **UI:** main nav must fit at 1263 px without scrolling; times in the property timezone; money via cents helpers.

---

## 4 · Architecture decision format

Long-lived choices go into `docs/ARCHITECTURE.md` as:

```text
DECISION: <title>
STATUS: proposed | accepted
CONTEXT: <one paragraph — the situation and why a decision is needed>
OPTIONS:
  A. <name> — <trade-off>
  B. <name> — <trade-off>
RECOMMENDATION: <option letter> — <one sentence why>
CONSEQUENCE: <what becomes easier / harder>
```

---

## 5 · Communication style (caveman protocol)

Terse, direct, focused on code and actionable trade-offs. No conversational fluff. Report what ran and what it showed; say plainly what wasn't verified.

---

## 6 · Project memory (Obsidian)

Background decisions, long-term memory and session logs live in the Obsidian vault:

**Memory path:** `/mnt/c/Users/ASPIRE V/Documents/obsi-uro/svelte-pms`

- **Session start:** read `context.md`, then check recent entries in `log/` and `pending-deploys.md`.
- **Before concluding a task:** write a brief summary of what changed, was fixed, or is planned next.
- Agents read the vault; only the orchestrator (main session) writes it.

| Note | Contents |
| --- | --- |
| `context.md` | Start page: what the project is, where things are, current status, next up |
| `pending-deploys.md` | Work that is local but not on staging, with owner. Read before any deploy; add a line for local-only work, delete it once deployed |
| `conventions.md` | Lasting rules: architecture, invariants, tooling, deploy steps, gotchas, how to verify. A rule still true next week goes here |
| `index.md` | Log entries grouped by topic — add each new heading under its topic |
| `log/YYYY-MM.md` | Dated log, newest at the bottom. Append to the current month's file, never to `context.md` |

Several sessions may work at once: check `pending-deploys.md` and file modification times before editing a shared note.

---

## 7 · Remote servers

| Environment | SSH | Directory |
| --- | --- | --- |
| Staging (non-production) | `ssh ops@flowstackdigital.xyz` | `/var/www/app.flowstackdigital.xyz/svelte-pms` |

`ops@flowstackdigital.xyz` and `ops@app.flowstackdigital.xyz` are the same staging server. Nothing is deployed there yet — see `pending-deploys.md`. Production readiness blockers (PR-01 HTTPS, PR-02 seed/credentials, PR-04 backups) must be resolved before any shared environment.
