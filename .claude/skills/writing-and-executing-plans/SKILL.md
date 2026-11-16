---
name: writing-and-executing-plans
description: Plan discipline for the Hotel PMS pipeline. Writing mode — how the architect turns an approved scope into handover.md work packages. Executing mode — how artisans, unit-testers and amenders carry out exactly one package or finding group with an acceptance check and no scope creep. Load when decomposing work or before executing a package.
---

# Writing and executing plans

Two modes — don't mix them. The plan artifact is `.claude/agents/specs/handover.md` (format in `architect.md` and `PROJECT_CONTEXT.md` §8). There is no `PLAN.md` and no git: progress is reported, not committed.

## WRITING MODE (architect)

**Trigger:** scope is settled (PR-xx item, spec section, or a decision from `brainstorming`). Requirements still open → brainstorm first, don't plan around a guess.

**Package = smallest independently verifiable unit.** One concern, typically one to three files:

| kind | typical files | acceptance looks like |
| --- | --- | --- |
| migration | `src/lib/server/db/schema.ts` (+ SQL to append) | table/columns/indexes/triggers listed; data migration for existing rows stated |
| domain-kernel | `src/lib/shared/domain/<x>.ts` + `<x>.test.ts`, or `src/lib/server/domain/<x>.ts` | pure function outputs for listed cases; callers + impact listed |
| contract + handler | `features/<m>/<s>/contract.ts`, `handler.server.ts` | ack shape, guards (status → 409, scope → 404, role → 403), invariants kept |
| route-adapter | `src/routes/api/<m>/<path>/+server.ts` | one line; method matches command/query |
| page-load / slice-ui | `+page.ts`, `+page.svelte`, `features/<m>/<s>/<Name>.svelte` | page renders, action invalidates the right `app:<key>`, errors shown, fits 1263 px |
| test | `src/lib/server/<area>.integration.test.ts`, `*.test.ts` | each PR-xx **Done when** line asserted |

Every package has: exact `files`, `depends_on`, `signatures`, `acceptance` (binary, observable), `tests`. Nothing says "as needed", "etc." or "update callers" without naming them.

**Quality gate before handing off**
- [ ] Each acceptance line is pass/fail and testable
- [ ] Same-wave packages share no files; each hot file has one owner per wave
- [ ] Schema work is wave 1; consumers depend on it
- [ ] Kernel reuse checked (no re-implemented locking, pricing, tax, folio or invoice logic)
- [ ] Every PR-xx **Done when** line maps to a package acceptance + test
- [ ] Risks listed (locks, data migration on existing rows, contract changes with callers)

## EXECUTING MODE (artisan · unit-tester · amender)

**Trigger:** you were handed one package (or one finding group).

1. Re-read your block fully, plus `PROJECT_CONTEXT.md` §4–§5.
2. Change only the listed files — exactly what's specified.
3. Run the acceptance check you can run: typecheck always; the package's own test file when it exists (commands in `PROJECT_CONTEXT.md` §6).
4. Report in the doer format (`PROJECT_CONTEXT.md` §8). That report *is* the checkpoint.

**Blocked** (ambiguous spec, missing file in your set, conflicting instruction) → stop, leave files compiling, report `blocked` with exactly what's needed. Don't improvise around it.

**YAGNI:** spotted something worth improving outside your package? Don't do it. Put one line in `notes` ("deferred: …"); the orchestrator decides whether it becomes a PR-xx item or a later package.

## Anti-patterns (stop if you catch yourself)

- Planning while requirements are open · executing without re-reading the block
- Touching files outside the package "because it was small"
- Two concerns in one package (e.g. schema + UI) · refactoring adjacent code
- Reporting done without having run the typecheck / your test file
