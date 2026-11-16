#!/usr/bin/env bash
# Seeds a FRESH database with the demo hotel "Harbor House" (rooms, rates, taxes, catalog, channel mappings,
# staff logins) and, unless --no-demo, 10 demo bookings. Does nothing if the property already exists.
# Run migrate.sh first.
#   bash scripts/ops/seed.sh [--no-demo]
# Needs: DATABASE_URL, PII_ENCRYPTION_KEY. Optional: SEED_ADMIN_PASSWORD, SEED_STAFF_PASSWORD
# (otherwise a random password is generated and printed ONCE — store it in your password manager).
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

for arg in "$@"; do
	[[ "$arg" == "--no-demo" ]] || { info "Usage: bash scripts/ops/seed.sh [--no-demo]"; exit 1; }
done
load_env
require_node
require_env DATABASE_URL PII_ENCRYPTION_KEY

run_tool seed "$@"
