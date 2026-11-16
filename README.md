# Hotel PMS & Guest Folio

SvelteKit implementation of `hotel_pms_guest_folio_project_specification.md` — all four phases:
inventory engine, front desk + guest folio, public booking engine, channel manager + insights.
Design decisions and audit notes: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Production-readiness backlog (PR-01 … PR-30): [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md).

## Run it in Docker (nginx → app → Postgres)

```bash
cp .env.example .env     # set POSTGRES_PASSWORD, CHANNEL_WEBHOOK_SECRET, PII_ENCRYPTION_KEY (see below); optionally HTTP_PORT
#   POSTGRES_PASSWORD=$(openssl rand -hex 24)   CHANNEL_WEBHOOK_SECRET=$(openssl rand -hex 32)
#   SEED_DEMO=true  → seed the demo hotel on an empty DB (dev/staging only; SEED_ADMIN_PASSWORD / SEED_STAFF_PASSWORD optional)
docker compose up -d --build
open http://localhost:8088
```

`docker compose` refuses to start without `POSTGRES_PASSWORD`, `CHANNEL_WEBHOOK_SECRET` and `PII_ENCRYPTION_KEY`.
An empty database gets **no** property or users unless `SEED_DEMO=true`. For a real hotel, create it with the bootstrap command
(see [First install](#first-install-real-property)).

| Service | Dockerfile | Role |
| --- | --- | --- |
| `db` | `postgres:17-alpine` | Postgres (host port `127.0.0.1:5433` for dev tools) |
| `migrate` | `docker/migrate/Dockerfile` | one-shot: migrations + ID re-encryption, then the demo seed **only if `SEED_DEMO=true`**; app waits for it to succeed |
| `app` | `docker/app/Dockerfile` | SvelteKit adapter-node, non-root, `/healthz`, port 3000 internal only |
| `nginx` | `docker/nginx/Dockerfile` | public entry on `HTTP_PORT` (default 8088): gzip, immutable asset caching, rate limits on login POSTs and `/api/public/*`, forwards real IP/proto/host |

Image size strategy (each Dockerfile: `deps → build → node → runtime`):
- Runtime base is plain `alpine` + `libstdc++` + the `node` binary copied from `node:alpine` — no npm/yarn/corepack.
- **app**: server dependencies are `devDependencies`, so adapter-node bundles them into `build/` → no `node_modules` in the image.
- **migrate**: `scripts/*.ts` are bundled with esbuild (`npm run build:tools`) and migrations run through drizzle-orm's migrator → no drizzle-kit/tsx.
- Root filesystem ≈ 142 MB each, of which 124 MB is the node binary.

Night audit from cron: `docker compose run --rm migrate node night-audit.mjs`.
For HTTPS, terminate TLS in nginx (or in front of it) and keep `X-Forwarded-Proto` — the session cookie becomes `Secure` automatically.

## Guest ID encryption (PR-21)

Passport / ID numbers are stored as AES-256-GCM envelopes (`v1:<keyId>:<iv>:<tag>:<ciphertext>`, bound to the guest row).
The UI only ever shows `••••` + last 4 (stored separately); nothing decrypts outside key rotation. A DB CHECK rejects plaintext.

```bash
# one key per environment — the dev key in .env.example is for local use only
echo "PII_ENCRYPTION_KEY=prod1:$(openssl rand -base64 32)" >> .env
```

| Situation | Steps |
| --- | --- |
| **First deploy of PR-21** | `docker compose stop app` **then** `docker compose up -d --build`. The old app would otherwise write plaintext and be rejected by the new CHECK (422 on check-in). The `migrate` container encrypts existing rows, fills last4 and validates the constraint before the new app starts. |
| **Rotate the key** | Put the new key in `PII_ENCRYPTION_KEY`, move the old one to `PII_ENCRYPTION_PREVIOUS_KEYS` (comma-separated), `docker compose up -d`. Re-encryption runs online (check-ins keep working, old and new envelopes both readable), but loading the new key **recreates the single app container — expect ~10 s of 502s**, like any deploy; do it in a quiet moment. Re-run `docker compose run --rm migrate node reencrypt-id-documents.mjs` until it prints `remaining 0`, then drop the old key. |
| **Script exit codes** | `0` ok · `1` fatal (missing/invalid key, DB error) → app does not start · `2` some rows could not be decrypted (guest ids printed) → app still starts; fix the keyring and re-run. |
| **Health check** | `SELECT convalidated FROM pg_constraint WHERE conname = 'guest_id_document_number_encrypted'` must be `t`. `f` means plaintext or undecryptable rows remain — re-run the script and read its output. |

Losing the active key makes stored ID numbers unrecoverable (only last 4 remain) — back it up with the database backups (PR-04).

## Run it locally

```bash
cp .env.example .env            # adjust secrets
npm install
npm run db:up                   # Postgres 17 on localhost:5433 (also creates pms_test)
npm run db:migrate              # schema + invariants (exclusion constraint, append-only ledger)
npm run db:seed                 # demo hotel (dev only), staff logins printed to the console
npm run dev                     # http://localhost:5173
```

| Login | Role |
| --- | --- |
| `admin@harbor.test` | Super admin — everything, incl. Setup → Roles & permissions (locked, can't be restricted) |
| `manager@harbor.test` | Manager — all operations, setup, reports + CSV export, insights, full audit log, void payments, night audit, rates & channels |
| `revenue@harbor.test` | Revenue manager — rates & inventory, channels, insights; read-only tape chart & reservations |
| `frontdesk@harbor.test` | Front desk — front desk, tape chart, reservations, folio & payments, housekeeping, add order, cashier report |
| `pos@harbor.test` | POS — *Add order to room* only |

Password = `SEED_ADMIN_PASSWORD` (or the random one the seed prints); staff use `SEED_STAFF_PASSWORD` when set.
These are the **defaults**: the Super admin edits each role's permissions per property in **Setup → Roles & permissions**
(23 permissions; changes apply on the next request and are recorded in the audit log as "Role permissions changed").
The seed skips an already-seeded database, so an existing DB doesn't get the `manager@` / `revenue@` demo users.
These demo logins exist only where the demo seed ran — never seed a shared or production database.

**Staff users** are managed in **Setup → Staff** (Super admin and Manager by default): add a user with a temporary password
(or *Generate* one), change role, deactivate / reactivate, reset password. A temporary password must be changed at first
sign-in (`/account/password`; every page and API is blocked until then). Deactivating or resetting a user signs them out
everywhere immediately. Anyone can change their own password from the name link in the header. Managers can't manage
Super admins, and the last active Super admin can't be deactivated or demoted.
Public booking engine: `/book/harbor-house`.

## Tests

```bash
npm run check                                   # svelte-check (TS strict)
TEST_DATABASE_URL=postgres://pms:pms@localhost:5433/pms_test npm test
```
DB integration tests are skipped when `TEST_DATABASE_URL` is unset. Migrate the test DB first:
`DATABASE_URL=$TEST_DATABASE_URL npm run db:migrate`.

## Layout — vertical slices + CQRS

```text
src/lib/
  shared/            isomorphic kernel: CQRS contracts + client bus, pure domain rules, UI primitives
  server/            DB schema, CQRS executors/HTTP adapters, auth, security, transactional kernel
  features/<module>/<slice>/
      contract.ts         name · path · zod input · result type · roles   (client + server)
      handler.server.ts   the use case
      *.svelte            slice UI (optional)
src/routes/api/…/+server.ts   one-line adapters: POST = command, GET = query
```

Client: `ask(Query, params, fetch)` in `load` + `depends('app:x')`; `send(Command, input)` → `invalidate('app:x')`
(`createAction` wraps pending/error/invalidation). One command = one DB transaction.

## Operations

- **Night audit** (NIGHTLY posting mode): `npm run night-audit` from cron after midnight property time,
  or the *Run night audit* button. Idempotent per reservation-night.
- **ARI push**: inventory/booking changes enqueue `channel_outbox` rows in the same transaction;
  *Channels → Push ARI now* (or `POST /api/channels/outbox/process`) delivers them, signed with
  `X-PMS-Signature`. Mappings without a push URL are marked dry-run.
- **OTA webhook**: `POST /api/public/channels/webhook`, HMAC-SHA256 of the raw body with `CHANNEL_WEBHOOK_SECRET`.
- **iCal**: export `GET /api/public/ical/<token>.ics` per mapping; import via *Sync iCal*.
- Behind a reverse proxy set adapter-node's `ADDRESS_HEADER`/`XFF_DEPTH` so rate limits see real client IPs, and `ORIGIN`.

### First install (real property)

Creates exactly one property, its Super admin and the night-audit system user — no demo data, no rooms or rates
(set those up in **Setup** after signing in). Refused if the database already has a property (pass
`--allow-existing-properties` to add another hotel), if the slug or email is taken, or if the email is a reserved
system address (`night-audit@…`, `…system`).

```bash
# without Docker
bash scripts/ops/migrate.sh
bash scripts/ops/bootstrap.sh --property-name "Seaside Inn" --slug seaside-inn --admin-email owner@seaside.example \
  [--admin-name "Owner Name"] [--timezone Asia/Manila] [--currency PHP]
# with Docker
docker compose up -d --build
docker compose run --rm migrate node bootstrap.mjs --property-name "Seaside Inn" --slug seaside-inn --admin-email owner@seaside.example
```

- Defaults: timezone `UTC`, currency `USD`, admin name `Administrator`. Exit codes: `0` created · `1` refused/invalid/fatal (nothing created).
- The admin password is generated and printed **once** on stdout (never accepted as an argument, never logged or audited). Don't pipe the output into a log file. It must be changed at first sign-in.
- One audit row "Property created (bootstrap)" is written with the new admin as actor.

**Before any real use, rotate the dev credentials:** generate a new `POSTGRES_PASSWORD` (for an existing volume also run
`ALTER ROLE pms PASSWORD '…'` in psql), a new per-environment `PII_ENCRYPTION_KEY` and `CHANNEL_WEBHOOK_SECRET`; leave
`SEED_DEMO`, `SEED_ADMIN_PASSWORD` and `SEED_STAFF_PASSWORD` unset in production.

### Servers without Docker (`scripts/ops/*.sh`)

Bash wrappers that run the pre-bundled tools in `dist-tools/` with a plain **Node 22+** binary — no Docker, `tsx` or devDependencies needed at run time.

Build once per deploy (on the server or in CI, then copy `dist-tools/` + `drizzle/` + `scripts/ops/`):

```bash
npm ci && npm run build && npm run build:tools
```

Configuration comes from the environment or `.env` in the app folder (`ENV_FILE=/path/to/env` to use another file). The file is read as plain `KEY=VALUE` lines and is never executed; variables already set in the shell win. Other knobs: `NODE_BIN`, `TOOLS_DIR`, `APP_ROOT`.

| Script | What it does | Needs |
| --- | --- | --- |
| `bash scripts/ops/migrate.sh` | Applies migrations, then re-encrypts guest ID numbers under the active key (exit 2 = some rows failed to decrypt) | `DATABASE_URL`, `PII_ENCRYPTION_KEY` |
| `bash scripts/ops/bootstrap.sh --property-name <name> --slug <slug> --admin-email <email> […]` | First install of a real property (see above) — prints the one-time admin password once | `DATABASE_URL` |
| `bash scripts/ops/seed.sh [--no-demo]` | Fresh DB only: demo hotel *Harbor House* (rooms, rates, taxes, catalog, staff logins) + 10 demo bookings; `--no-demo` = setup only. No-op if the property exists. Prints the generated passwords **once** unless `SEED_ADMIN_PASSWORD` / `SEED_STAFF_PASSWORD` are set | `DATABASE_URL`, `PII_ENCRYPTION_KEY` |
| `bash scripts/ops/seed-demo.sh --property <slug> [--operator <email>] [--count <1-50>]` | Adds demo bookings to an **existing** property: one stay per room in service (default 10); the first four arrive today and are checked in with folio charges. Goes through the real handlers and is audited under the operator (default: the property's first active Super admin). Refused if the property already has reservations | `DATABASE_URL`, `PII_ENCRYPTION_KEY` |
| `bash scripts/ops/reset-operational-data.sh …` | The go-live reset below, plus a preflight dry run, a `pg_dump` backup and optional app stop/start hooks | `DATABASE_URL`, `pg_dump` 17+ |

Production first install: `migrate.sh` → `bootstrap.sh`. Typical staging cycle: `migrate.sh` → `seed.sh` → test → `reset-operational-data.sh … --confirm <slug>` → `seed-demo.sh --property <slug>` → test again → reset before go-live.

Reset on a bare-metal server (replace the slug, email and service commands with yours):

```bash
# dry run — prints counts, changes nothing
bash scripts/ops/reset-operational-data.sh --property harbor-house --operator admin@harbor.test
# real run — preflight, backup to ./backups (or $BACKUP_DIR), stop app, reset, start app
APP_STOP_CMD="sudo systemctl stop svelte-pms" APP_START_CMD="sudo systemctl start svelte-pms" \
  bash scripts/ops/reset-operational-data.sh --property harbor-house --operator admin@harbor.test --confirm harbor-house
```

- A confirmed run stops **before** backup or stopping the app if the preflight is refused, `--confirm` doesn't match `--property`, or invoices exist without `--force`.
- The app is restarted even when the reset fails. Without `APP_STOP_CMD`, stop the app yourself; the tool warns when other DB sessions are connected.
- Backups are written with mode `600` in a `700` folder (`backups/` is git-ignored). They contain guest PII, so delete them once go-live is confirmed. Restore: `pg_restore --clean --if-exists --no-owner -d <database> <file>`.
- `--no-backup` skips the dump (only if you already have one). The database password is passed to `pg_dump` through `PG*` environment variables, never on the command line.

### Operational data reset (go-live)

Purpose: wipe the **test/demo operational data of ONE property** before go-live. Run it only before the hotel starts real trading; it cannot be undone except from the backup taken in step 1.

- **Removed** (for that property only): reservations and nights, bookings, guests, folios, folio items, item taxes, payments, invoices (folio numbers) and invoice counters, room blocks, channel outbox, and the audit log (`audit_event`). Room-type inventory `sold_count` is reset to 0.
- **Kept**: property, staff users and sessions, role permissions, room types, room units (including housekeeping status), room inventory (except `sold_count`), rate plans and daily rates, tax rules, catalog items and channel mappings.
- The reset writes exactly one new audit row, `Operational data reset`, with the deleted counts.
- Other properties are never touched. The four append-only ledger triggers are disabled only inside the reset transaction and are verified enabled before commit.

Steps (replace `harbor-house` / `admin@harbor.test` with your property slug and an active ADMIN of that property):

1. **Back up first.** `docker compose exec -T db pg_dump -U pms -Fc pms > backup-$(date +%F).dump`
2. **Stop the app** so no session writes during the reset: `docker compose stop app`
3. **Dry run** (changes nothing, prints per-table counts and any invoice refusal):
   `docker compose run --rm migrate node reset-operational-data.mjs --property harbor-house --operator admin@harbor.test`
4. **Real run**: repeat the same command with `--confirm harbor-house`. Add `--force` only if the dry run reports issued invoices and you accept deleting them:
   `docker compose run --rm migrate node reset-operational-data.mjs --property harbor-house --operator admin@harbor.test --confirm harbor-house [--force]`
5. **Start the app again**: `docker compose start app`

Arguments: `--property <slug>` (required) · `--operator <email>` (required; must be an active, non-system ADMIN of that property) · `--confirm <slug>` (must equal the property slug; omit for a dry run) · `--force` (allow deleting issued invoices).

Exit codes: `0` dry run printed or reset committed · `1` refused or fatal (bad arguments, unknown property, operator not allowed, confirm mismatch, invoices issued without `--force`, DB error). A refusal or failure leaves the data unchanged. A lock timeout (10 s) or a deadlock aborts the whole transaction, so nothing changed and the command is safe to re-run.

Before running for real:

- **Invoices.** If any invoice was issued, the real run is refused (exit 1) unless `--force` is given. Invoice numbers restart at 1 after the reset. If any invoice has already left the hotel (guest or tax authority), change the property's `invoice_prefix` before the first real invoice after `--force`, so the new series cannot collide with the old numbers.
- **Channel feeds.** Clear or deactivate the iCal feeds and OTA mappings first. Otherwise the next iCal sync or OTA webhook can re-import reservations that still exist in the channel's feed and recreate them after the reset.
- **Housekeeping** statuses are kept, so re-check room status after the reset.
- **Database role (risk F6).** The `pms` role used by every container is a superuser and owns all tables. The append-only triggers protect against application bugs, not against a database-level operator. A dedicated least-privilege app role and a separate ops role are recommended as later hardening.
