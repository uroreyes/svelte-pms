/**
 * Adds demo bookings (reservations, in-house guests, folio charges) to ONE existing property.
 * Refused when the property already has reservations — run the operational reset first.
 *   DATABASE_URL=… PII_ENCRYPTION_KEY=… npm run db:seed:demo -- --property <slug> [--operator <email>] [--count <1-50>]
 * Exit codes: 0 at least one booking created · 1 refused, nothing created, or fatal.
 */
import { createDb } from '$lib/server/db/client';
import { parseKeyring } from '$lib/server/security/crypto';
import { parseDemoSeedArgs } from '$lib/server/maintenance/seed-demo-args';
import { errorSummary, runDemoSeed } from '$lib/server/maintenance/seed-demo';

const USAGE = 'Usage: seed-demo --property <slug> [--operator <email>] [--count <1-50>]';

async function main(): Promise<number> {
	const parsed = parseDemoSeedArgs(process.argv.slice(2));
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
	const ring = parseKeyring(process.env.PII_ENCRYPTION_KEY, process.env.PII_ENCRYPTION_PREVIOUS_KEYS);
	const { db, close } = createDb(url, { max: 2 });
	try {
		return await runDemoSeed(db, parsed.args, { ring, now: new Date(), log: console.log, error: console.error });
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
