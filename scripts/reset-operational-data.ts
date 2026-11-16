/**
 * Wipes operational data (reservations, folios, guests, bookings, audit trail) for ONE property.
 * Dry run by default; the reset runs only with --confirm <property-slug>.
 *   DATABASE_URL=… npm run ops:reset -- --property <slug> --operator <email> [--confirm <slug>] [--force]
 * Stop the app first (docker compose stop app). Refused when invoices were issued unless --force.
 * Exit codes: 0 dry run printed or reset committed · 1 refused or fatal.
 */
import { createDb } from '$lib/server/db/client';
import { parseResetArgs } from '$lib/server/maintenance/reset-args';
import { runOperationalReset } from '$lib/server/maintenance/reset-operational-data';

const USAGE = 'Usage: reset-operational-data --property <slug> --operator <email> [--confirm <slug>] [--force]';

async function main(): Promise<number> {
	const parsed = parseResetArgs(process.argv.slice(2));
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
	// One connection: a second pooled connection would count as an "other session" in the stop-the-app warning.
	const { db, close } = createDb(url, { max: 1 });
	try {
		return await runOperationalReset(db, parsed.args, {
			now: new Date(),
			log: console.log,
			error: console.error
		});
	} finally {
		await close();
	}
}

main()
	.then((code) => {
		process.exitCode = code;
	})
	.catch((e) => {
		console.error(e instanceof Error ? e.message : e);
		process.exitCode = 1;
	});
