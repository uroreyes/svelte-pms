# Findings — PR-02 bootstrap (review round 1)

Lanes: acceptance (clean) · conventions (1 nit) · security (1 nit). Design-lane F1–F5 resolved in handover Rev 2.

## G1 — amender · files: `scripts/bootstrap.ts`

- **C-F1** (nit) — top-level `.catch` prints `e instanceof Error ? e.message : e`; a Drizzle error escaping before `runBootstrap`'s try could print SQL text/params. Sibling `scripts/seed-demo.ts:40` uses `errorSummary(e)`.
  **fix-instruction:** add `import { errorSummary } from '$lib/server/maintenance/error-summary';` and change the catch body to `console.error(errorSummary(e));`.

## G2 — amender · files: `.env.example`

- **S-F1** (nit) — `CHANNEL_WEBHOOK_SECRET=change-me-to-a-long-random-string-0123456789` passes the compose `:?` guard and the min-32 check, so an unchanged copy gets a publicly known HMAC secret.
  **fix-instruction:** set `CHANNEL_WEBHOOK_SECRET=` (empty) and put the generation hint on its own comment line above it: `# generate: openssl rand -hex 32` (comments must stay on their own lines — `scripts/ops/_common.sh` load_env does not strip inline comments). Keep `PII_ENCRYPTION_KEY` as is (already labelled DEV ONLY; orchestrator decision).
