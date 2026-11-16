# Handover — PR-02 · Demo seed runs on every boot + default credentials

_Rev 2 — design-audit findings F1–F5 resolved (changelog below). Precedent: `src/lib/server/maintenance/{reset-args.ts, reset-operational-data.ts, seed-demo-args.ts, seed-demo.ts}` + thin `scripts/*.ts` + `scripts/ops/*.sh` via `_common.sh`._

### Changelog (Rev 2)

- **F1** P3: unique-violation handling specified — `pgErrorCode(e) === PG.UNIQUE_VIOLATION` + new `pgConstraintName(e)` (walks `.cause`, reads `constraint_name`) in `src/lib/server/db/pg-errors.ts`; real names `property_slug_unique` (drizzle/0000_init.sql:123) and `staff_user_email_unique` (drizzle/0000_init.sql:229); lock scope stated; P4 race test vs direct `staffUser` insert.
- **F2** P3: `errorSummary` moved to new `src/lib/server/maintenance/error-summary.ts`; `seed-demo.ts` imports and re-exports it (so `scripts/seed-demo.ts:10` is unchanged); bootstrap imports only `error-summary.ts`.
- **F3** Verification step 5 runs through `docker compose run --rm … migrate` with SEED_DEMO unset / empty / `false` / `true`, plus `docker compose config | grep SEED_DEMO`.
- **F4** P1 rejects reserved admin emails (`night-audit@…`, `….system`); P3 does two separate lookups; system-email hit → `SLUG_TAKEN`.
- **F5** P4 refusal tests assert zero rows per attempted slug/email/night-audit email and zero `ops.bootstrapProperty` audit rows.

## Header

- **Scope:** PR-02 (P0, effort S). Fix items 1–4:
  1. Migrate CMD runs `node migrate.mjs` (+ existing re-encrypt step) only. Seeding needs explicit opt-in: `SEED_DEMO=true`.
  2. Bootstrap command: `node bootstrap.mjs --property-name … --slug … --admin-email …` + `scripts/ops/bootstrap.sh` (staging has no Docker). Prints a one-time password; admin has `must_change_password = true` (PR-03).
  3. `POSTGRES_PASSWORD` required in compose (`${POSTGRES_PASSWORD:?…}`); document `openssl rand -hex 24`.
  4. Rotate dev credentials before real use — doc only (orchestrator).
- **Done when (verbatim):** `docker compose up` on an empty DB creates **no** property or users · bootstrap creates exactly one property + admin · compose refuses to start without `POSTGRES_PASSWORD`.
- **Conventions notes:** maintenance code never imports `$env` / `$lib/server/db` singleton; script parses `process.env`; pure arg parser + `run…(db, args, deps)` returning exit code; one transaction; password printed once on stdout, never logged elsewhere, never in audit.
- **Migrations planned:** none.
- **New routes / pages / nav:** none.
- **Audit labels:** `'ops.bootstrapProperty': 'Property created (bootstrap)'` (P3).
- **PII_KEYS additions:** none — audit input = `{ propertySlug, propertyName, currency, timezone }`; admin identified by `actor_user_id`; no email / person name in input or result.
- **npm scripts:** `"ops:bootstrap": "tsx scripts/bootstrap.ts"`; `build:tools` gains `scripts/bootstrap.ts` (P2).
- **Skills used:** brainstorming, writing-and-executing-plans.
- **Security-sensitive packages:** P3 (credential generation/hashing, first admin creation, password output, race handling), P2 (compose secrets, migrate CMD, bash wrapper output handling).

### Decisions (brainstorming)

```
DECISION 1: Bootstrap guard scope
AMBIGUITY: refuse when ANY property exists (single-tenant install) or only on same slug/email?
OPTIONS:  A. Any-property guard + opt-out flag — refuse if property table non-empty unless --allow-existing-properties — safe for first install, second tenant stays possible but explicit
          B. Slug/email only — simpler; a mistyped re-run on prod silently creates a second tenant
RECOMMEND: A — bootstrap is a first-install tool; a second tenant must be explicit. Slug + email checks apply in both modes.
QUESTION: none

DECISION 2: Audit row for bootstrap
OPTIONS:  A. One audit row via recordAudit, actor = the new admin, command 'ops.bootstrapProperty' — matches reset precedent (reset-operational-data.ts:258)
          B. No audit — first row of history missing
RECOMMEND: A.
QUESTION: none

DECISION 3: Demo seed opt-in mechanism
OPTIONS:  A. Shell guard in migrate CMD on SEED_DEMO — seed.mjs unchanged, still runnable explicitly
          B. seed.ts reads SEED_DEMO itself — breaks explicit `node seed.mjs` / seed.sh usage
RECOMMEND: A.
QUESTION: none

DECISION 4: Timezone / currency validation reuse
RECOMMEND: extract `ianaTimezone` + `currencyCode` (and new `propertySlug`) into `src/lib/shared/cqrs/schemas.ts`; `update-property-settings/contract.ts` imports them (behaviour-identical).
```

## Packages

### P1 — shared schemas + bootstrap arg parser
```
kind: domain-kernel
files:
  - src/lib/shared/cqrs/schemas.ts                                   (add exports)
  - src/lib/features/setup/update-property-settings/contract.ts      (import instead of local const)
  - src/lib/server/maintenance/bootstrap-args.ts                     (new)
  - src/lib/server/maintenance/bootstrap-args.test.ts                (new)
depends_on: []
model: haiku
skills: [writing-and-executing-plans, vitest-testing, verification-before-completion]
signatures:
  # schemas.ts (moved verbatim from update-property-settings/contract.ts:6-16 and :25)
  export const ianaTimezone = z.string().refine(<Intl.DateTimeFormat try/catch>, { message: 'Unknown IANA timezone' });
  export const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code, e.g. USD');
  /** Public booking URL segment: lower-case letters, digits, single hyphens; 2–63 chars. */
  export const propertySlug = z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/, 'Slug: lower-case letters, digits and hyphens (2–63 chars)').refine((s) => !s.includes('--'), 'Slug: no double hyphens');
  # update-property-settings/contract.ts: input { …, currency: currencyCode, timezone: ianaTimezone, … } — same messages, same behaviour

  # bootstrap-args.ts
  export interface BootstrapArgs {
    propertyName: string;        // shortText(120)
    slug: string;                // propertySlug
    adminEmail: string;          // staffEmail (lower-cased), not reserved
    adminName: string;           // staffName, default 'Administrator'
    timezone: string;            // ianaTimezone, default 'UTC'
    currency: string;            // currencyCode, default 'USD'
    allowExistingProperties: boolean;
  }
  export type BootstrapParseResult = { ok: true; args: BootstrapArgs } | { ok: false; error: string };
  export function parseBootstrapArgs(argv: readonly string[]): BootstrapParseResult;
  value flags: --property-name --slug --admin-email --admin-name --timezone --currency
  boolean flag: --allow-existing-properties
data: none (pure)
security:
  - email lower-cased via staffEmail
  - reserved system addresses rejected: lower-cased admin email starting `night-audit@` or ending `.system` (migration 0007_staff_management.sql:3 treats any `night-audit@%` as system)
  - no password flag (password always generated — never on argv / shell history / ps)
errors (returned as { ok:false, error }, first problem wins, same style as seed-demo-args.ts):
  - `Unknown argument: <tok>` · `Duplicate flag: <flag>` · `Missing value for <flag>`
  - `Missing --property-name <name>` · `Missing --slug <slug>` · `Missing --admin-email <email>`
  - invalid value → `<flag>: <first zod issue message>` (e.g. `--timezone: Unknown IANA timezone`)
  - reserved email → `--admin-email: reserved for the system user`
acceptance:
  - parseBootstrapArgs(['--property-name','Sea View','--slug','sea-view','--admin-email',' Boss@Sea.Test ']) → ok, adminEmail 'boss@sea.test', adminName 'Administrator', timezone 'UTC', currency 'USD', allowExistingProperties false
  - every error string above reachable; flags accepted in any order
  - UpdatePropertySettings input behaviour unchanged (existing tests stay green)
tests: src/lib/server/maintenance/bootstrap-args.test.ts
  - happy path + defaults; all optional flags set (Asia/Manila, PHP, --allow-existing-properties)
  - missing each required flag; unknown arg; duplicate; value missing / value is another flag
  - bad slug ('Sea View', '-x', 'a', 'a--b', 64 chars), bad email, bad timezone ('Mars/Base'), bad currency ('usd')
  - reserved emails: 'night-audit@x.test', 'Night-Audit@X.test', 'ops@harbor.system', 'a@B.SYSTEM' → `--admin-email: reserved for the system user`
```

### P2 — ops wiring: compose, migrate image, bash wrapper, build
```
kind: ops
files:
  - docker-compose.yml
  - docker/migrate/Dockerfile
  - scripts/ops/bootstrap.sh            (new)
  - package.json                        (scripts only — no dependency changes)
  - .env.example
depends_on: []
model: haiku
skills: [writing-and-executing-plans, verification-before-completion]
signatures:
  # docker-compose.yml
  line 5:  x-database-url: &database-url postgres://pms:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env (openssl rand -hex 24)}@db:5432/pms
  db.environment.POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env (openssl rand -hex 24)}
  migrate.environment += SEED_DEMO: ${SEED_DEMO:-false}
  migrate service header comment: "migrations + re-encrypt; demo seed only when SEED_DEMO=true"; add
    #   docker compose run --rm migrate node bootstrap.mjs --property-name <name> --slug <slug> --admin-email <email> [--admin-name …] [--timezone …] [--currency …]
  # docker/migrate/Dockerfile
  CMD ["sh", "-c", "node migrate.mjs && (node reencrypt-id-documents.mjs || [ $? -eq 2 ]) && if [ \"$SEED_DEMO\" = \"true\" ]; then node seed.mjs; fi"]
  header comments: lines 2/5 drop "idempotent seed" from the default chain, add SEED_DEMO=true note + bootstrap.mjs usage line + "bootstrap exit codes: 0 created · 1 refused/invalid/fatal (nothing created)"
  # scripts/ops/bootstrap.sh — same shape as seed-demo.sh
  #!/usr/bin/env bash; header: purpose, usage, Needs: DATABASE_URL, exit codes, "The admin password is printed ONCE on stdout — don't pipe this script into a log file."
  source _common.sh; no args / -h / --help → usage to stderr, exit 1
  load_env; require_node; require_env DATABASE_URL; run_tool bootstrap "$@"
  usage: bash scripts/ops/bootstrap.sh --property-name <name> --slug <slug> --admin-email <email> [--admin-name <name>] [--timezone <IANA>] [--currency <ISO 4217>] [--allow-existing-properties]
  # package.json
  "ops:bootstrap": "tsx scripts/bootstrap.ts"
  build:tools: append scripts/bootstrap.ts to the esbuild entry list (keep every existing entry and flag)
  # .env.example
  POSTGRES_PASSWORD=            # required by docker compose; generate: openssl rand -hex 24 (hex keeps DATABASE_URL valid); keep DATABASE_URL/TEST_DATABASE_URL in sync
  SEED_DEMO=                    # true = load demo hotel "Harbor House" on boot (dev/staging only — never production)
  SEED_ADMIN_PASSWORD / SEED_STAFF_PASSWORD comments: "only used with SEED_DEMO=true / seed.sh"
data: none
security: PII_ENCRYPTION_KEY not required by bootstrap (no guest data); wrapper never echoes args or env; no `set -x`; password only reaches stdout of the tool
errors: compose config fails with the `:?` message when POSTGRES_PASSWORD unset or empty
acceptance:
  - `env -u POSTGRES_PASSWORD docker compose --env-file /dev/null config` exits non-zero with "set POSTGRES_PASSWORD in .env"
  - migrate container on an empty DB with SEED_DEMO unset / empty / false → property and staff_user both 0 rows
  - with SEED_DEMO=true → Harbor House seeded (unchanged behaviour)
  - `bash -n scripts/ops/bootstrap.sh` passes; `bash scripts/ops/bootstrap.sh` (no args) prints usage, exit 1
  - build:tools emits dist-tools/bootstrap.mjs (after P3 exists)
tests: orchestrator verification steps 3, 5, 7 — no vitest file
```

### P3 — bootstrap runner + script entry + audit label
```
kind: ops (maintenance)
files:
  - src/lib/server/maintenance/bootstrap.ts        (new)
  - scripts/bootstrap.ts                           (new)
  - src/lib/server/maintenance/error-summary.ts    (new — errorSummary moved here verbatim from seed-demo.ts:184-189)
  - src/lib/server/maintenance/seed-demo.ts        (delete local errorSummary; `import { errorSummary } from './error-summary'` + `export { errorSummary } from './error-summary'` so scripts/seed-demo.ts:10 keeps working)
  - src/lib/server/db/pg-errors.ts                 (add pgConstraintName)
  - src/lib/shared/domain/audit-labels.ts          (hot file — add one label)
depends_on: [P1]
model: sonnet
skills: [writing-and-executing-plans, verification-before-completion]
signatures:
  // pg-errors.ts — same walk as pgErrorCode (depth ≤ 4 over .cause)
  /** constraint_name of a postgres.js error (possibly wrapped by Drizzle), else undefined. */
  export function pgConstraintName(error: unknown): string | undefined;
  // error-summary.ts
  /** Message without SQL text or bound params (Drizzle wraps the driver error as `cause`). */
  export function errorSummary(e: unknown): string;
  // bootstrap.ts — imports: DB type, schema (property, staffUser), hashPassword, tempPasswordFromBytes, recordAudit, pgErrorCode/PG/pgConstraintName, errorSummary from './error-summary'. Must NOT import ./seed-demo, executeCommand, slice handlers or crypto keyring (keeps bootstrap.mjs small).
  export const BOOTSTRAP_COMMAND = 'ops.bootstrapProperty';
  export const systemUserEmail = (slug: string) => `night-audit@${slug}.system`;
  export type BootstrapRefusalCode = 'PROPERTY_EXISTS' | 'SLUG_TAKEN' | 'EMAIL_TAKEN';
  export class BootstrapRefused extends Error { constructor(readonly code: BootstrapRefusalCode, message: string) }
  export interface BootstrapResult { propertyId: string; adminUserId: string; systemUserId: string }
  /** One transaction. Password hashing happens before the tx (scrypt is slow; keep lock time short). */
  export async function bootstrapProperty(db: DB, args: BootstrapArgs, opts: { password: string; now: Date }): Promise<BootstrapResult>;
  /** CLI body. Exit codes: 0 created · 1 refused or fatal (nothing created). */
  export async function runBootstrap(db: DB, args: BootstrapArgs, deps: {
    now: Date;
    generatePassword?: () => string;   // default: tempPasswordFromBytes(crypto.getRandomValues(new Uint8Array(64)))
    log: (line: string) => void;       // stdout — summary + password
    error: (line: string) => void;     // stderr
  }): Promise<number>;
  // scripts/bootstrap.ts — clone of scripts/reset-operational-data.ts structure
  USAGE = 'Usage: bootstrap --property-name <name> --slug <slug> --admin-email <email> [--admin-name <name>] [--timezone <IANA>] [--currency <ISO 4217>] [--allow-existing-properties]'
  parse → on error print error + USAGE to stderr, exit 1; DATABASE_URL missing → 'DATABASE_URL is not set', exit 1
  createDb(url, { max: 1 }); runBootstrap(db, args, { now: new Date(), log: console.log, error: console.error }); close in finally
  // audit-labels.ts
  'ops.bootstrapProperty': 'Property created (bootstrap)'
data (bootstrapProperty — try { db.transaction(…) } catch → classify):
  inside the tx, in order:
  1. SET LOCAL lock_timeout = '10s'
  2. LOCK TABLE property IN SHARE ROW EXCLUSIVE MODE
     — serialises bootstrap vs bootstrap and vs any other property INSERT (seed.ts). It does NOT block staff_user inserts from the app
       (staff.* uses lockStaffDirectory = FOR NO KEY UPDATE → ROW SHARE, no conflict) and staff_user.email is globally unique,
       so the email race is guarded only by the unique constraint + the catch below.
  3. slug exists → SLUG_TAKEN `Property slug "<slug>" already exists`
  4. any property exists && !allowExistingProperties → PROPERTY_EXISTS
  5. lookup A: staff_user.email = adminEmail → EMAIL_TAKEN `Email <adminEmail> is already in use`
  6. lookup B: staff_user.email = systemUserEmail(slug) → SLUG_TAKEN `Night-audit user for slug "<slug>" already exists`
  7. insert property { slug, name: propertyName, currency, timezone }   (address/taxRateBp/roomPostingMode/invoicePrefix = column defaults)
  8. insert admin staff_user { propertyId, email: adminEmail, name: adminName, role: 'ADMIN', passwordHash, active: true, mustChangePassword: true }
  9. insert system staff_user { propertyId, email: systemUserEmail(slug), name: 'Night audit (system)', role: 'MANAGER', active: false, isSystem: true, passwordHash: hash(randomBytes(32).toString('hex')) }
     (required by scripts/night-audit.ts:21-27, else the property is skipped)
  10. recordAudit(tx, { command: BOOTSTRAP_COMMAND, actor: { userId: admin.id, propertyId, role: 'ADMIN', name: adminName, email: adminEmail, mustChangePassword: true }, input: { propertySlug, propertyName, currency, timezone }, result: { propertyId, staffUserId: admin.id }, now })
  catch (after rollback — nothing persisted, no orphan property row):
  - BootstrapRefused → rethrow
  - pgErrorCode(e) === PG.UNIQUE_VIOLATION:
      pgConstraintName(e) === 'property_slug_unique'    (drizzle/0000_init.sql:123) → SLUG_TAKEN `Property slug "<slug>" already exists`
      pgConstraintName(e) === 'staff_user_email_unique' (drizzle/0000_init.sql:229) → re-run lookup B outside the tx: hit → SLUG_TAKEN night-audit message; else EMAIL_TAKEN `Email <adminEmail> is already in use`
      other constraint → rethrow
  - anything else → rethrow (runBootstrap prints `Bootstrap failed: <errorSummary(e)>`)
  reused: hashPassword ($lib/server/auth/password), tempPasswordFromBytes ($lib/shared/domain/staff), recordAudit ($lib/server/audit/record), pgErrorCode + PG ($lib/server/db/pg-errors). No rooms/rates/taxes/catalog created — the admin sets those up in /setup.
security:
  - password generated server-side only; never accepted as input; printed exactly once via deps.log; never passed to error(), audit, or any thrown message
  - admin must_change_password = true → only 'authenticated' contracts allowed until changed (PR-03)
  - system user inactive (CHECK staff_user_system_inactive)
  - no $env import; DATABASE_URL read only in scripts/bootstrap.ts
  - fatal errors printed via errorSummary (no SQL text / bound params)
output (runBootstrap success, via log):
  Created property "<name>" (<slug>) · timezone <tz> · currency <cur>
  Admin: <email>
  One-time password: <password>
  Store it now — it is not shown again. It must be changed at first sign-in.
  Public booking page: /book/<slug> (add rooms and rates in Setup first)
errors (runBootstrap → error(message), return 1):
  - SLUG_TAKEN: `Property slug "<slug>" already exists` | `Night-audit user for slug "<slug>" already exists`
  - PROPERTY_EXISTS: `This database already has <n> property(ies) — bootstrap is for a fresh install (pass --allow-existing-properties to add another)`
  - EMAIL_TAKEN: `Email <email> is already in use`
  - other: `Bootstrap failed: <errorSummary>`
acceptance:
  - bootstrap creates exactly one property + admin (+ the inactive night-audit system user)
  - admin row: role ADMIN, active true, mustChangePassword true, verifyPassword(printed password, hash) === true
  - refusals (incl. constraint-race refusals) leave property / staff_user / audit_event unchanged and return exit 1
  - exactly one audit_event row for the new property, command 'ops.bootstrapProperty', actor_user_id = admin id, input contains no email
  - the password string appears in exactly one log() call and in no error() call
  - seed-demo behaviour unchanged (existing src/lib/server/seed-demo.integration.test.ts green; scripts/seed-demo.ts compiles unchanged)
  - dist-tools/bootstrap.mjs bundle contains no seed-demo / check-in handler code (grep for `createFrontDeskReservation` → no match)
tests: P4 (+ existing seed-demo.integration.test.ts as regression)
```

### P4 — integration tests
```
kind: test
files:
  - src/lib/server/bootstrap.integration.test.ts   (new)
depends_on: [P3]
model: sonnet
skills: [vitest-testing, slice-integration-testing, verification-before-completion]
data: real test DB (openTestDb); unique slug/email per test (`b-${randomUUID().slice(0,12)}`); the test DB always has other tenants → success cases pass allowExistingProperties: true; fixed password via generatePassword
helper: assertNothingCreated(slug, adminEmail) →
  property rows where slug = <slug> → 0
  staff_user rows where email IN (<adminEmail>, night-audit@<slug>.system) → 0 (except rows a test inserted itself on purpose — assert those are unchanged)
  audit_event rows where command = 'ops.bootstrapProperty' AND input->>'propertySlug' = <slug> → 0
tests:
  - "bootstrap creates exactly one property + admin": runBootstrap → 0; property rows with slug = 1; staff_user for propertyId: exactly 1 non-system (ADMIN, active, mustChangePassword true, email lower-cased) + 1 system (MANAGER, inactive, isSystem, email night-audit@<slug>.system); timezone/currency stored
  - printed password: log lines contain it exactly once; error lines never; verifyPassword(pw, admin.passwordHash) true
  - audit: one audit_event for propertyId, command 'ops.bootstrapProperty', actorUserId = admin id, input has no 'email'/'adminEmail' key, AUDIT_LABELS has the label
  - PROPERTY_EXISTS: makeProperty first, run with allowExistingProperties false → exit 1; bootstrapProperty rejects with code PROPERTY_EXISTS; assertNothingCreated
  - SLUG_TAKEN (property): second run same slug, different email → refused; assertNothingCreated for the second email; first property's row count still 1
  - SLUG_TAKEN (night-audit): pre-insert staff_user `night-audit@<slug>.system` (isSystem, inactive) on a fixture property, then bootstrap with that slug → code SLUG_TAKEN, message `Night-audit user for slug "<slug>" already exists`; no property row for slug
  - EMAIL_TAKEN: new slug, email of an existing fixture admin → refused; assertNothingCreated (tx rolled back)
  - race bootstrap vs bootstrap: two bootstrapProperty calls same slug in Promise.allSettled → exactly one fulfilled, one BootstrapRefused SLUG_TAKEN
  - race bootstrap vs staff insert (F1): Promise.allSettled([bootstrapProperty(email E), db.insert(staffUser).values({ propertyId: fixture, email: E, … })]) → exactly one succeeds; if bootstrap lost → BootstrapRefused EMAIL_TAKEN (not a raw error) and 0 property rows for the slug (no orphan); if insert lost → its error has pgErrorCode 23505; repeat ~5 iterations to exercise both orders
  - pgConstraintName unit case: a caught Drizzle-wrapped unique violation from a direct duplicate insert → 'staff_user_email_unique'
  - night-audit compat: system user query in the scripts/night-audit.ts:21-24 shape (propertyId + isSystem) returns the row
```

## Waves

| Wave | Packages | Notes |
| --- | --- | --- |
| 1 | P1, P2 | disjoint files; P2's build:tools entry references scripts/bootstrap.ts created in wave 2 (only checked at orchestrator build) |
| 2 | P3 | |
| 3 | P4 | |

## Hot-files

| Hot file | Wave | Owner |
| --- | --- | --- |
| docker-compose.yml | 1 | P2 |
| package.json (scripts only) | 1 | P2 |
| src/lib/shared/domain/audit-labels.ts | 2 | P3 |

Also single-owner (non-hot): `src/lib/server/db/pg-errors.ts`, `src/lib/server/maintenance/seed-demo.ts` → P3, wave 2.
Not touched: schema.ts, enums.ts, cqrs/*, server/domain/*, audit/record.ts, (app)/+layout.svelte, testkit.ts, seed.ts.

## Backward compatibility

- `UpdatePropertySettings` contract: validators moved, same rules/messages; callers (`src/routes/api/setup/property/+server.ts`, setup UI) unaffected.
- `errorSummary`: callers `seed-demo.ts:208` (internal) and `scripts/seed-demo.ts:10,40` — kept via re-export from `seed-demo.ts`; no other callers (grep).
- `pg-errors.ts`: additive export only; `pgErrorCode` / `PG` unchanged.
- Migrate image default CMD no longer seeds: existing DBs unaffected (seed was an idempotent no-op on them). Fresh dev DBs need `SEED_DEMO=true` in `.env` (orchestrator: add to local `.env` if wanted; local DB already has Harbor House).
- Compose without POSTGRES_PASSWORD now fails — local `.env` already sets it (`pms`); README quickstart must say so.
- `scripts/ops/migrate.sh` already excludes the seed — no change. `seed.sh` / `seed.mjs` unchanged (explicit opt-in).
- PROJECT_CONTEXT §6 `TEST_DATABASE_URL=postgres://pms:pms@db…` assumes dev password `pms` — keep it locally.

## Questions

None blocking.

## Assumptions

- Bootstrap creates property + admin + night-audit system user only; no rooms, rates, taxes, catalog (configured in /setup).
- `--allow-existing-properties` opt-out for multi-tenant use (DECISION 1).
- Default timezone `UTC`, currency `USD`, admin name `Administrator` when flags omitted.
- No `--password` flag; password always generated (16 chars, PR-03 generator).
- The bash wrapper needs only `DATABASE_URL`.
- Hex password recommended so `DATABASE_URL` stays URL-safe.

## Deps

None.

## Verification (orchestrator)

`node22` helper per PROJECT_CONTEXT §6. `<pw>` = POSTGRES_PASSWORD from `.env`.

1. Typecheck: `node22 'npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json --output human'` → 0 errors.
2. `node22 'npx vitest run src/lib/server/maintenance/bootstrap-args.test.ts src/lib/server/bootstrap.integration.test.ts src/lib/server/seed-demo.integration.test.ts'`, then the full suite.
3. Compose guard (Done when 3): `env -u POSTGRES_PASSWORD docker compose --env-file /dev/null config >/dev/null; echo $?` → non-zero, stderr contains `set POSTGRES_PASSWORD`. Same with `POSTGRES_PASSWORD=` (empty).
4. `docker compose up -d --build` (dev stack still boots; Harbor House intact). `docker compose config | grep SEED_DEMO` → `SEED_DEMO: "false"` with SEED_DEMO unset.
5. Empty DB (Done when 1), through compose, without touching the dev volume:
   - `docker compose exec db psql -U pms -c 'CREATE DATABASE pms_pr02_a'`
   - for each of: SEED_DEMO unset · `SEED_DEMO=` · `SEED_DEMO=false`:
     `env -u SEED_DEMO docker compose run --rm -e DATABASE_URL=postgres://pms:<pw>@db:5432/pms_pr02_a migrate` (resp. `SEED_DEMO= docker compose run …`, `SEED_DEMO=false docker compose run …`; the shell value overrides `.env`)
     → `docker compose exec db psql -U pms -d pms_pr02_a -tAc 'select (select count(*) from property), (select count(*) from staff_user)'` → `0|0`
   - `docker compose exec db psql -U pms -c 'CREATE DATABASE pms_pr02_b'`; `SEED_DEMO=true docker compose run --rm -e DATABASE_URL=postgres://pms:<pw>@db:5432/pms_pr02_b migrate` → property slug `harbor-house` present.
6. Bootstrap (Done when 2) on `pms_pr02_a`: `docker compose run --rm -e DATABASE_URL=postgres://pms:<pw>@db:5432/pms_pr02_a migrate node bootstrap.mjs --property-name "Check Inn" --slug check-inn --admin-email ops@check.test` → exit 0, password printed once; counts → property 1, staff_user 2 (1 ADMIN active must_change_password, 1 system inactive); re-run → exit 1 SLUG_TAKEN; different slug without flag → exit 1 PROPERTY_EXISTS; `--admin-email night-audit@x.test` → exit 1 `--admin-email: reserved for the system user`.
7. Bash wrapper (no-Docker path): `node22 'npm run build:tools'`; `grep -c createFrontDeskReservation dist-tools/bootstrap.mjs` → 0; then in a `node:22` (Debian, has bash) container on `svelte-app_default`: `bash scripts/ops/bootstrap.sh` → usage + exit 1; `DATABASE_URL=postgres://pms:<pw>@db:5432/pms_pr02_a bash scripts/ops/bootstrap.sh --property-name X --slug x2 --admin-email a@x2.test --allow-existing-properties` → exit 0.
8. Drop `pms_pr02_a` and `pms_pr02_b`.
9. Docs (orchestrator only):
   - README: quickstart (POSTGRES_PASSWORD required + `openssl rand -hex 24`); migrate row ("migrations + re-encrypt; demo seed only with SEED_DEMO=true"); the :58-73 seed section; ops table adds `bootstrap.sh`; production first-install steps `migrate.sh` → `bootstrap.sh`.
   - README "rotate dev credentials before real use": new POSTGRES_PASSWORD (`ALTER ROLE pms PASSWORD …`), PII key, CHANNEL_WEBHOOK_SECRET, no SEED_* in production.
   - `docs/PRODUCTION_READINESS.md` PR-02 status; PROJECT_CONTEXT §3 scripts row (bootstrap.ts; migrate container runs migrate → reencrypt [→ seed if SEED_DEMO]).
   - Obsidian: `conventions.md:24`, `context.md:11`, a `pending-deploys.md` row, log entry.

Summary: 4 packages, 3 waves, 0 open questions.
