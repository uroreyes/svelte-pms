/**
 * Creates the first property + admin on a fresh database (no demo data). Prints a one-time password ONCE on stdout.
 *   DATABASE_URL=… npm run ops:bootstrap -- --property-name <name> --slug <slug> --admin-email <email>
 * Exit codes: 0 created · 1 refused, invalid or fatal (nothing created).
 */
import { createDb } from '$lib/server/db/client';
import { parseBootstrapArgs } from '$lib/server/maintenance/bootstrap-args';
import { runBootstrap } from '$lib/server/maintenance/bootstrap';
import { errorSummary } from '$lib/server/maintenance/error-summary';

const USAGE =
	'Usage: bootstrap --property-name <name> --slug <slug> --admin-email <email> [--admin-name <name>] [--timezone <IANA>] [--currency <ISO 4217>] [--allow-existing-properties]';

async function main(): Promise<number> {
	const parsed = parseBootstrapArgs(process.argv.slice(2));
	if (!parsed.ok) {
		console.error(parsed.error);
		console.error(USAGE);
		return 1;
	}
	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error('DATABASE_URL is not set');
		return 1;
	}
	const { db, close } = createDb(url, { max: 1 });
	try {
		return await runBootstrap(db, parsed.args, { now: new Date(), log: console.log, error: console.error });
	} finally {
		await close();
	}
}

main()
	.then((code) => {
		process.exitCode = code;
	})
	.catch((e) => {
		console.error(errorSummary(e));
		process.exitCode = 1;
	});
