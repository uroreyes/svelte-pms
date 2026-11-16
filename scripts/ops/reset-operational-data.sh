#!/usr/bin/env bash
# Go-live reset of ONE property's operational data (bookings, guests, folios, payments, invoices, audit log)
# on a server without Docker. Wraps dist-tools/reset-operational-data.mjs; see README "Operational data reset".
#
#   bash scripts/ops/reset-operational-data.sh --property <slug> --operator <admin email>                    # dry run
#   bash scripts/ops/reset-operational-data.sh --property <slug> --operator <admin email> --confirm <slug> [--force] [--no-backup]
#
# A confirmed run does, in order:
#   1. dry run with the same arguments — stops here if the property/operator is refused, --confirm does not
#      match, or invoices were issued and --force is missing (nothing stopped, nothing backed up);
#   2. pg_dump -Fc backup to $BACKUP_DIR (default <app>/backups, mode 700) unless --no-backup;
#      pg_dump must be the server's major version or newer (17);
#   3. $APP_STOP_CMD if set (e.g. "sudo systemctl stop svelte-pms"), otherwise a warning to stop the app yourself;
#   4. the reset (one transaction — all or nothing);
#   5. $APP_START_CMD if set — also when the reset fails.
# Needs: DATABASE_URL. Exit codes: 0 dry run printed or reset committed · 1 refused or failed (data unchanged).
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

USAGE="Usage: bash scripts/ops/reset-operational-data.sh --property <slug> --operator <email> [--confirm <slug>] [--force] [--no-backup]"

args=()
dry_args=()
backup=1
property=""
confirm=""
while (($#)); do
	case "$1" in
	--no-backup) backup=0 ;;
	--confirm)
		[[ $# -ge 2 ]] || { info "Missing value for --confirm"; info "$USAGE"; exit 1; }
		confirm="$2"
		args+=("$1" "$2")
		shift
		;;
	--property)
		[[ $# -ge 2 ]] || { info "Missing value for --property"; info "$USAGE"; exit 1; }
		property="$2"
		args+=("$1" "$2")
		dry_args+=("$1" "$2")
		shift
		;;
	-h | --help) info "$USAGE"; exit 0 ;;
	*)
		args+=("$1")
		dry_args+=("$1")
		;;
	esac
	shift
done

load_env
require_node
require_env DATABASE_URL

# Dry run: hand everything to the tool (it validates the arguments and prints the counts).
if [[ -z "$confirm" ]]; then
	((backup == 1)) || info "note: --no-backup only matters with --confirm"
	run_tool reset-operational-data "${args[@]}"
	exit $?
fi

[[ "$confirm" == "$property" ]] || die "--confirm \"$confirm\" does not match --property \"$property\" — nothing changed"

# 1. Preflight dry run.
info "== Preflight (dry run) =="
preflight="$(run_tool reset-operational-data "${dry_args[@]}" 2>&1)" || { printf '%s\n' "$preflight" >&2; die "preflight refused — nothing changed"; }
printf '%s\n' "$preflight"
if [[ "$preflight" == *"Would refuse without --force"* ]]; then
	die "\"$property\" has issued invoices (or a non-zero invoice counter); re-run with --force only if deleting them is intended — nothing changed"
fi

# 2. Backup.
if ((backup == 1)); then
	command -v pg_dump >/dev/null 2>&1 || die "pg_dump not found — install the PostgreSQL 17 client tools, or pass --no-backup if you already have a backup"
	backup_dir="${BACKUP_DIR:-$APP_ROOT/backups}"
	(umask 077 && mkdir -p "$backup_dir")
	backup_file="$backup_dir/pms-${property//[^a-zA-Z0-9-]/_}-$(date -u +%Y%m%dT%H%M%SZ).dump"
	info "== Backup → $backup_file =="
	(
		umask 077
		export_pg_env
		pg_dump --format=custom --no-owner --file="$backup_file"
	) || { rm -f "$backup_file"; die "backup failed — nothing changed"; }
	info "backup ok ($(du -h "$backup_file" | cut -f1)); it contains guest PII — keep it private, delete it when no longer needed"
else
	info "warning: --no-backup — the reset cannot be undone"
fi

# 3. Stop the app (restart is guaranteed by the trap).
restart_app() {
	if [[ -n "${APP_START_CMD:-}" ]]; then
		info "== Starting app: $APP_START_CMD =="
		bash -c "$APP_START_CMD" || info "warning: APP_START_CMD failed — start the app manually"
	fi
}
if [[ -n "${APP_STOP_CMD:-}" ]]; then
	info "== Stopping app: $APP_STOP_CMD =="
	trap restart_app EXIT
	bash -c "$APP_STOP_CMD" || die "APP_STOP_CMD failed — nothing changed"
else
	info "warning: APP_STOP_CMD is not set — make sure the app is stopped (the tool warns about other DB sessions)"
	[[ -z "${APP_START_CMD:-}" ]] || trap restart_app EXIT
fi

# 4. Reset.
info "== Reset =="
status=0
run_tool reset-operational-data "${args[@]}" || status=$?
if ((status == 0)) && [[ -n "${backup_file:-}" ]]; then
	info "Restore if needed: pg_restore --clean --if-exists --no-owner -d <database> \"$backup_file\""
fi
exit "$status"
