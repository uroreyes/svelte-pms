#!/usr/bin/env bash
# Applies DB migrations (drizzle/*.sql), then re-encrypts guest ID numbers under the active PII key.
# Same chain as the Docker migrate image, minus the seed. Safe to re-run.
#   bash scripts/ops/migrate.sh
# Needs: DATABASE_URL, PII_ENCRYPTION_KEY (and PII_ENCRYPTION_PREVIOUS_KEYS while rotating).
# Exit codes: 0 ok · 1 fatal · 2 migrations applied but some ID numbers could not be decrypted (fix the keyring, re-run).
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

[[ $# -eq 0 ]] || { info "Usage: bash scripts/ops/migrate.sh"; exit 1; }
load_env
require_node
require_env DATABASE_URL PII_ENCRYPTION_KEY

run_tool migrate
status=0
run_tool reencrypt-id-documents || status=$?
if ((status == 2)); then
	info "warning: some guest ID numbers could not be decrypted (see the guest ids above) — fix the keyring and re-run"
fi
exit "$status"
