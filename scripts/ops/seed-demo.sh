#!/usr/bin/env bash
# Adds demo bookings to ONE existing property: one stay per room in service (up to --count, default 10),
# the first four arriving today are checked in with a couple of folio charges each. Everything goes through
# the real handlers and is audited under the operator. Refused if the property already has reservations —
# typical staging cycle: reset-operational-data.sh → seed-demo.sh → test → reset again before go-live.
#   bash scripts/ops/seed-demo.sh --property <slug> [--operator <admin email>] [--count <1-50>]
# Needs: DATABASE_URL, PII_ENCRYPTION_KEY.
# Exit codes: 0 at least one booking created · 1 refused, nothing created, or fatal.
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

if [[ $# -eq 0 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
	info "Usage: bash scripts/ops/seed-demo.sh --property <slug> [--operator <admin email>] [--count <1-50>]"
	exit 1
fi
load_env
require_node
require_env DATABASE_URL PII_ENCRYPTION_KEY

run_tool seed-demo "$@"
