# shellcheck shell=bash
# Shared helpers for the non-Docker ops scripts (sourced, not executed).
# They run the pre-bundled tools in dist-tools/*.mjs (npm run build:tools) with a plain Node 22+ binary,
# so the server needs neither Docker, tsx nor devDependencies at run time.
#
# Environment (all optional):
#   ENV_FILE    env file to load (default <app>/.env; variables already set in the shell win)
#   APP_ROOT    app checkout (default: two levels above this file)
#   TOOLS_DIR   bundled tools (default <app>/dist-tools)
#   NODE_BIN    node binary (default: node on PATH)
set -euo pipefail

OPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="${APP_ROOT:-$(cd "$OPS_DIR/../.." && pwd)}"
TOOLS_DIR="${TOOLS_DIR:-$APP_ROOT/dist-tools}"
NODE_BIN="${NODE_BIN:-node}"
export MIGRATIONS_DIR="${MIGRATIONS_DIR:-$APP_ROOT/drizzle}"

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
info() { printf '%s\n' "$*" >&2; }

# Reads KEY=VALUE lines without evaluating them (no $(…), no expansion). Blank lines and # comments are
# skipped, one pair of surrounding quotes is stripped, CRLF is tolerated. Inline "# comments" are NOT stripped.
load_env() {
	local file="${ENV_FILE:-$APP_ROOT/.env}"
	if [[ ! -f "$file" ]]; then
		[[ -z "${ENV_FILE:-}" ]] || die "ENV_FILE not found: $file"
		return 0
	fi
	local line key value
	while IFS= read -r line || [[ -n "$line" ]]; do
		line="${line%$'\r'}"
		[[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
		[[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
		key="${BASH_REMATCH[2]}"
		value="${BASH_REMATCH[3]}"
		if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
		[[ -n "${!key+x}" ]] || export "$key=$value"
	done <"$file"
}

require_node() {
	command -v "$NODE_BIN" >/dev/null 2>&1 || die "node not found — install Node 22+ or set NODE_BIN"
	local major
	major="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
	((major >= 22)) || die "Node 22+ required, found $("$NODE_BIN" -v)"
}

require_env() {
	local v
	for v in "$@"; do
		[[ -n "${!v:-}" ]] || die "$v is not set (export it or add it to ${ENV_FILE:-$APP_ROOT/.env})"
	done
}

tool_path() {
	local f="$TOOLS_DIR/$1.mjs"
	[[ -f "$f" ]] || die "$f not found — build the tools first: npm ci && npm run build:tools"
	printf '%s' "$f"
}

# run_tool <name> [args…] — runs dist-tools/<name>.mjs and returns its exit code (caller decides).
run_tool() {
	local f
	f="$(tool_path "$1")"
	shift
	"$NODE_BIN" "$f" "$@"
}

# Exports PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE[/PGSSLMODE] from DATABASE_URL so pg_dump / psql never
# get the password on their command line (visible in `ps`). Call inside a subshell to keep them scoped.
export_pg_env() {
	local k v
	while IFS= read -r -d '' k && IFS= read -r -d '' v; do
		export "$k=$v"
	done < <("$NODE_BIN" -e '
		const u = new URL(process.env.DATABASE_URL);
		const d = decodeURIComponent;
		const out = { PGHOST: u.hostname.replace(/^\[|\]$/g, ""), PGPORT: u.port || "5432", PGUSER: d(u.username), PGPASSWORD: d(u.password), PGDATABASE: d(u.pathname.slice(1)) };
		const ssl = u.searchParams.get("sslmode");
		if (ssl) out.PGSSLMODE = ssl;
		for (const [k, v] of Object.entries(out)) process.stdout.write(k + "\0" + v + "\0");
	')
}
