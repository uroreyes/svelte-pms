# Project context — shared by every pipeline agent

Single source of truth for the agents in `.claude/agents/` (architect · artisan · unit-tester · auditor · amender).
If an agent file and this file disagree, **this file wins** — fix the agent file.
Product: small-hotel **PMS & Guest Folio** (`hotel_pms_guest_folio_project_specification.md`).

## 1 · Pipeline (QuadA-P) and shared artifacts

```
1 architect        → .claude/agents/specs/handover.md            (plan; checkpoint: user answers Questions / approves Deps)
2 auditor  lane=design  → findings on the handover               (before any code; type: architecture)
3 artisan ×N       → one package each, wave by wave              (parallel within a wave, disjoint files)
  unit-tester ×N   → test packages (kind: test), same waves
4 orchestrator     → verification commands (§6) — all green before review
5 auditor  lanes=security | conventions | acceptance  (parallel, read-only)
6 amender ×N       → one disjoint finding group each
7 auditor  lane=delta → re-check amended files; loop 6–7 until clean
8 orchestrator     → mark PR-xx in docs/PRODUCTION_READINESS.md, log to Obsidian (§7)
```

| Artifact | Written by | Read by |
| --- | --- | --- |
| `.claude/agents/specs/PROJECT_CONTEXT.md` (this file) | humans / orchestrator | everyone, first |
| `.claude/agents/specs/handover.md` | architect | artisan, unit-tester (own package only), auditor, amender |
| `.claude/agents/specs/findings.md` | orchestrator (collects auditor reports) | amender (own group only), auditor (delta) |

The repo is **not a git repository** → there is no `git diff`. "Changed files" = the package `files` lists + each agent report's `files`.

## 2 · Stack

SvelteKit 2 + Svelte 5 runes · TypeScript `strict` + `noUncheckedIndexedAccess` · Tailwind 4 · PostgreSQL 17 · Drizzle ORM 0.45 + postgres.js · Zod 4 · Vitest 3 · npm (exact versions) · Docker Compose (`db` → `migrate` → `app` → `nginx` on :8088).
One app — no monorepo, no separate API server, no Prisma, no Supabase, no React.

## 3 · Code map

| Path | Role |
| --- | --- |
| `src/lib/features/<module>/<slice>/contract.ts` | Isomorphic contract: `command<R>()({ name, path, input, permission })` / `query<R>()(…)`. `permission`: one `PermissionKey` from `shared/domain/permissions.ts` (required), `'public'`, or `'authenticated'` (any signed-in user, not in the grid — only for self-service on the caller's own account, e.g. `account.changePassword`; also the only contracts allowed while `must_change_password` is set). Fine-grained checks inside handlers via `ctx.permissions.has(key)`; UI via `can(actor.permissions, key)` |
| `src/lib/features/<module>/<slice>/handler.server.ts` | Use case: `CommandHandler<typeof X>` · `QueryHandler` · `PublicCommandHandler` · `PublicQueryHandler` · `NonTxCommandHandler` (network I/O only) |
| `src/lib/features/<module>/<slice>/*.svelte` | Slice UI. Mutations via `createAction(Contract, { invalidates })` + `<ErrorNote error={action.error} />` |
| `src/lib/features/<module>/*.ts`, `<module>/ui/` | Module-level shared code (only for slices of the same module) |
| `src/routes/api/**/+server.ts` | One-line adapters: `staffCommand` · `staffQuery` · `staffCommandNoTx` · `publicCommand` · `publicQuery` (from `$lib/server/cqrs/endpoint`) |
| `src/routes/(app)/**/+page.ts` / `+layout.ts` | Loads: `askOrThrow(Query, params, fetch)` + `depends('app:<key>')`. Never import server code |
| `src/routes/book/**` | Public booking engine (no session) |
| `src/lib/shared/cqrs/` | `contract.ts`, `client.ts` (`send` / `ask` / `askOrThrow`), `schemas.ts` (`isoDate`, `id`, `cents`, `guestInput`, `party`, `likePattern`, …) |
| `src/lib/shared/domain/` | Pure, isomorphic rules: `dates`, `money`, `tax`, `pricing`, `availability`, `folio`, `ical`, `csv`, `enums`, `audit-labels`, `id-document` (last4 + mask) |
| `src/lib/shared/ui/` | `action.svelte.ts`, `ErrorNote`, `StatusBadge`, `PageHeader`, `MoneyInput` |
| `src/lib/server/cqrs/` | `execute.ts` (authorize → Zod parse → transaction → handler → audit), `endpoint.ts`, `errors.ts` (`DomainError`, `notFound`, `conflict`, `invalid`, `forbidden`, `toApiError`), `actor.ts` |
| `src/lib/server/domain/` | Transactional kernel: `inventory` (`lockInventory`, `consumeInventory`, `releaseInventory`, `readInventory`), `reservations` (`createReservation`, `lockReservation`, `cancelReservation`, `markNoShow`, `moveInventory`), `folio` (`lockFolio`, `appendItem`, `appendPayment`, `reverseItem`, `postRoomNights`), `rate-plans`, `taxes`, `invoice`, `outbox`, `rooms`, `property` |
| `src/lib/server/audit/record.ts` | Automatic audit of every command; `PII_KEYS` redaction list |
| `src/lib/server/security/` | `rate-limit`, `hmac`, `safe-url` (SSRF guard), `crypto` (AES-256-GCM PII envelope: `encryptField` / `decryptField`, `parseKeyring`, `PiiKeyring`) · `src/lib/server/auth/` (scrypt, sessions) · `src/lib/server/config.ts` (env → `channelSecret()`, `piiKeyring()`; adapters only) |
| `src/lib/server/maintenance/` | Actor-less, cross-tenant system operations called from scripts (e.g. `reencryptIdDocuments` — backfill + key rotation; `resetOperationalData` — go-live wipe of one property's operational data, the only code allowed to bypass the append-only triggers; `seedDemoBookings` — demo bookings for an existing property through the real executors; `bootstrapProperty` — first install: one property + Super admin + night-audit system user) |
| `src/lib/server/db/schema.ts` | Drizzle schema (single file) · `drizzle/NNNN_*.sql` migrations |
| `src/lib/server/testkit.ts` | Integration fixtures: `openTestDb`, `makeProperty`, `NOW`, `TODAY`, `guest` |
| `scripts/` | `bootstrap.ts`, `seed.ts` (`--no-demo`, demo only), `seed-demo.ts`, `migrate.ts`, `night-audit.ts`, `reencrypt-id-documents.ts`, `reset-operational-data.ts` (esbuild-bundled into `dist-tools/` by `npm run build:tools`; migrate container runs migrate → reencrypt → seed only if `SEED_DEMO=true`) |
| `scripts/ops/*.sh` | Bash wrappers for servers without Docker: run `dist-tools/*.mjs` with Node 22+, load `.env` without evaluating it (`_common.sh`); `reset-operational-data.sh` adds preflight dry run, pg_dump backup, `APP_STOP_CMD`/`APP_START_CMD` |
| `docs/ARCHITECTURE.md` · `docs/PRODUCTION_READINESS.md` | Decisions · backlog PR-01…PR-30 (problem / fix / **Done when**) — read-only for agents |

## 4 · Architecture rules (violations are blockers)

1. **Vertical slices.** A slice never imports another slice's `handler.server.ts`. Reuse lives in `shared/domain` (pure), `server/domain` (transactional) or a module-level file. UI composites may import sibling *contracts* of the same module.
2. **CQRS.** Command = `POST` JSON → exactly one transaction (opened by `executeCommand`; handlers never call `db.transaction` unless `NonTx`) → **ack only** (`{ <entity>Id }`, codes, counts). Query = `GET` → no writes → **read model** shaped for the UI. Never return a read model from a command or write in a query.
3. **Handlers receive `ctx.db`.** Handlers and `server/domain` never import `$lib/server/db` (the singleton), `$env`, or `$app/*`.
4. **Validation lives in the contract.** The executor parses input with the contract's Zod schema before the handler runs; handlers trust `input` and never re-parse. Never spread raw request bodies into inserts.
5. **Tenant isolation.** Every staff handler scopes reads and writes by `actor.propertyId`, including lookups by id (`and(eq(x.id, id), eq(x.propertyId, actor.propertyId))`).
6. **Errors.** Throw `DomainError` helpers (`invalid` 422 · `forbidden` 403 · `notFound` 404 · `conflict` 409). Never build HTTP responses in handlers; never return raw Postgres messages — `toApiError` maps known SQLSTATEs and logs the rest. Client receives `ApiResult<T>`.
7. **Secrets reach handlers by injection.** Keys/secrets come from `config.ts` and are passed to a handler factory in the route adapter (`staffCommand(CheckIn, makeCheckIn(piiKeyring))`, `makeProcessOutbox(channelSecret)`); scripts parse `process.env` themselves. Never import `$env` in handlers, kernel or maintenance code.
8. **Audit is automatic.** No per-slice audit code. New input field with personal data → `PII_KEYS` in `server/audit/record.ts`. New command → label in `shared/domain/audit-labels.ts`; never rename a command `name` without keeping the old label.
9. **UI.** Svelte 5 runes only (no stores for server data). Loads go through query endpoints. Times are formatted in the property timezone (`formatDateTime`, `dateIn`). Main nav must fit at 1263 px — prefer tabs inside an existing section.
10. **Authorization = one permission key per contract** (or `'public'` / `'authenticated'`). New contract → pick an existing key from `shared/domain/permissions.ts` (or add one: catalogue + `PERMISSION_REQUIRES` + `DEFAULT_GRANTS` + the pinned map in `access.integration.test.ts`). Never branch on `actor.role` in handlers or pages — use `ctx.permissions.has(key)` / `can(actor.permissions, key)`. Gated pages redirect in `+page.ts`/`+layout.ts` (`parent()` + `can` → `homePath`) instead of letting the query 403.

## 5 · Data invariants (never break)

- Money = integer cents; tax via `applyTaxes` / `quoteStay` / `priceLine` with rules from `loadTaxRules`. Stays are half-open `[check_in, check_out)`; dates are ISO `YYYY-MM-DD`.
- Inventory rows are locked with `lockInventory` (`FOR UPDATE`, ordered by date); several room types → room-type id order (`moveInventory`). Direct sales never exceed `available_count`; only OTA ingest may (flagged `overbooked`).
- Ledger tables `folio_item`, `folio_payment`, `folio_item_tax` and `audit_event` are **append-only** (triggers). Corrections = reversal rows (`reverseItem`, `appendPayment` with REFUND/VOID). Folio totals change only via `appendItem` / `appendPayment` under the folio lock.
- Room allocation: exclusion constraint `reservation_room_no_overlap` + `lockAssignableUnit`.
- Pricing is server-authoritative (`expectedTotalCents` mismatch → 409). Booked nights keep their `reservation_night` rate unless explicitly re-priced.
- Invoice numbers only via `nextInvoiceNumber` inside the settlement transaction (gap-free).
- DB-generated columns (`id`, `created_at`, `posted_at`, `paid_at`, `occurred_at`) never appear in insert payloads.
- Guest ID numbers are stored only as `v1:<keyId>:<iv>:<tag>:<ct>` envelopes (`encryptField`, AAD `guest:<guestId>`) — enforced by CHECK `guest_id_document_number_encrypted`; display uses `id_document_last4` + `maskIdDocument`; no read model loads the ciphertext and nothing decrypts outside rotation. Rotation: `pii:reencrypt` with the old key in `PII_ENCRYPTION_PREVIOUS_KEYS`.
- `role_permission` stores only overrides of `DEFAULT_GRANTS`; never a row for ADMIN (CHECK `role_permission_not_admin`); `roles.manage` is locked to ADMIN. Saves lock the property row `FOR NO KEY UPDATE` (`lockPermissionMatrix`).
- Staff management: every `staff.*` command calls `lockStaffDirectory` (property row `FOR NO KEY UPDATE`, then reloads the actor's permissions — never trust `ctx.permissions` for role checks) then `lockTarget`; subset rule `assertCanManageRole`; last-active-ADMIN guard; deactivate/reset revoke sessions in the same tx (`revokeUserSessions`). `is_system` users are never active and never addressable. Emails are stored lowercase.
- Lock order within a transaction: reservation → folios (by id) → inventory (room type id, then date).

## 6 · Commands (WSL has no Node — run from the repo root through Docker)

Shell state doesn't persist between Bash calls — define the helper in the same command line:

```sh
node22() { docker run --rm -v "$PWD":/app -v pms_node_modules:/app/node_modules -w /app --network svelte-app_default -e TEST_DATABASE_URL=postgres://pms:pms@db:5432/pms_test node:22-alpine sh -c "$1"; }

node22 'npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json --output human'   # typecheck — 0 errors
node22 'npx vitest run src/lib/shared/domain/tax.test.ts'                                     # one test file
node22 'DATABASE_URL=$TEST_DATABASE_URL npx drizzle-kit migrate && npx vitest run'            # full suite — orchestrator
node22 'npx drizzle-kit generate --name=<name>'                                               # orchestrator only
docker compose up -d --build                                                                  # orchestrator only
```

The `db` service must be up (`docker compose up -d db`) for integration tests. Never run `npm install`, `drizzle-kit generate`, `docker compose` or the full suite from a sub-agent — those are orchestrator steps.

## 7 · Memory & docs

- Obsidian vault `/mnt/c/Users/ASPIRE V/Documents/obsi-uro/svelte-pms/`: `context.md` (start), `conventions.md` (lasting rules), `pending-deploys.md`, `index.md`, `log/YYYY-MM.md`. Agents read it; only the orchestrator writes it.
- Tests: pure rules → colocated `*.test.ts`; use cases → `src/lib/server/<area>.integration.test.ts` through `executeCommand` / `executeQuery` / `executePublicCommand` against the real test DB, each test with its own `makeProperty(...)`. **No DB mocks** — mocked Drizzle proves nothing about locks, constraints or triggers.

## 8 · Shared vocabulary

- **Package** (handover): `P<n>` with `kind` ∈ `migration | domain-kernel | contract | handler | route-adapter | page-load | slice-ui | test | ops`, `files`, `depends_on`, `model`, `skills`, `signatures`, `data`, `security`, `errors`, `acceptance`, `tests`.
- **Finding** (auditor): `{ id: "F<n>", lane, file, line, severity: blocker | should-fix | nit, type: implementation | architecture, evidence, fix-instruction }`.
- **Doer report** (artisan · unit-tester · amender): `{ status: done | blocked, package | group, files: [], notes: ≤5 bullets, disputed?: [] }`.
- **Severity**: blocker = breaks function, test, invariant, security or acceptance · should-fix = real near-term cost · nit = cosmetic.
- **Skills** (`.claude/skills/<name>/SKILL.md`, load with the `Skill` tool):

  | Skill | Who loads it | When |
  | --- | --- | --- |
  | `brainstorming` | architect · auditor(design) · amender | ambiguity, competing designs, spec vs invariant conflict, failed attempt |
  | `writing-and-executing-plans` | architect (writing) · artisan, unit-tester, amender (executing) | decomposing work · before executing a package/group |
  | `vitest-testing` | unit-tester · auditor(acceptance) · artisan when a package lists tests | any test work; pure-rule unit tests |
  | `slice-integration-testing` | unit-tester · auditor(acceptance) | tests touching handlers, kernel, constraints, triggers |
  | `systematic-debugging` | artisan, unit-tester, amender | a check failed twice, recurring finding, Docker ≠ tests |
  | `verification-before-completion` | everyone before reporting done / clean; orchestrator before close-out | always last |
  | `dataviz` (global) | artisan | charts, KPI tiles (Insights) |

  Never reference skills not in this table.
