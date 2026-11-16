#!/usr/bin/env bash
# First install of a real property on an empty database: creates the property, its ADMIN user (must change the
# password at first login) and the night-audit system user. Nothing else (rooms, rates, taxes, catalog are set up
# in /setup). The admin password is generated and printed ONCE on stdout — don't pipe this script into a log file.
#   bash scripts/ops/bootstrap.sh --property-name <name> --slug <slug> --admin-email <email> [--admin-name <name>] [--timezone <IANA>] [--currency <ISO 4217>] [--allow-existing-properties]
# Needs: DATABASE_URL (PII_ENCRYPTION_KEY is not needed — no guest data).
# Exit codes: 0 created · 1 refused, invalid or fatal (nothing created).
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

if [[ $# -eq 0 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
	info "Usage: bash scripts/ops/bootstrap.sh --property-name <name> --slug <slug> --admin-email <email> [--admin-name <name>] [--timezone <IANA>] [--currency <ISO 4217>] [--allow-existing-properties]"
	exit 1
fi
load_env
require_node
require_env DATABASE_URL

run_tool bootstrap "$@"
