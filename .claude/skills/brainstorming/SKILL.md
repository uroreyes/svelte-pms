---
name: brainstorming
description: Structured decision protocol for the Hotel PMS when requirements are ambiguous, two valid designs compete, a spec rule conflicts with a technical constraint or data invariant, or a previous fix failed. Load before asking the user a clarifying question or proposing alternatives. Primary user — architect; also auditor (design lane) and amender (disputed findings).
---

# Brainstorming — decide before you plan

Use it to turn ambiguity into **one recommendation + at most one question**. Not for clear tasks, style preferences, or anything `PROJECT_CONTEXT.md` already answers.

## 1 · Look it up before calling it ambiguous

Check in this order — if one answers it, stop and proceed:

1. `.claude/agents/specs/PROJECT_CONTEXT.md` — rules §4, invariants §5
2. `docs/PRODUCTION_READINESS.md` — the PR-xx item's **Fix** and **Done when**
3. `docs/ARCHITECTURE.md` — accepted decisions (don't relitigate them)
4. `hotel_pms_guest_folio_project_specification.md`
5. Obsidian `conventions.md` and the latest `log/YYYY-MM.md` entries
6. The code — an existing slice that already solves a similar problem is the strongest precedent

## 2 · Protocol

1. **Ambiguity** — one sentence. *"PR-22 says 'anonymise after N months' but not whether folio payer names on settled invoices are in scope."*
2. **Options (2–3)** — name in ≤ 3 words · what it does · trade-off. Prefer options that reuse the kernel (`server/domain/*`) over new infrastructure.
3. **Recommendation** — pick one, one-sentence rationale, no hedging.
4. **One question** — only if the choice depends on an unstated business preference (policy, money, legal, UX). Batch it into the handover's **Questions**.

Typical PMS ambiguities worth a question: cancellation/no-show fee policy, which taxes apply to what, rounding presentation, retention periods, who may see guest PII, what counts as "occupied" for KPIs, OTA behaviour on overbooking.
Not worth a question: file layout, naming, which kernel helper to use — follow precedent.

## 3 · Conflicting constraints

When a spec/feature request collides with a technical reality or invariant:

1. State both constraints exactly (quote the spec line / name the invariant).
2. State why they conflict.
3. **Invariants win over convenience**: append-only ledger and audit, exact-cents money, tenant isolation, lock order, server-authoritative pricing, gap-free invoices, one transaction per command.
4. Propose the minimum change that satisfies both (usually a reversal row, a new read model, or a flag — never mutating history), and confirm before planning it.

## 4 · After a failed attempt

A fix or plan that already failed once is not retried as-is: write what was assumed, what the evidence showed, and switch to `systematic-debugging` before proposing a new option.

## Output (inline in the handover header or your report)

```
DECISION: <title>
AMBIGUITY: <one sentence>
OPTIONS:  A. <name> — <what> — <trade-off>
          B. <name> — <what> — <trade-off>
RECOMMEND: <A|B> — <one-sentence why>
QUESTION: <one question, or "none">
```
Long-lived choices also go into `docs/ARCHITECTURE.md` (DECISION format in CLAUDE.md) — orchestrator writes it.
