/**
 * Cron entry point: posts tonight's room + tax for every property.
 *   DATABASE_URL=… npm run night-audit            (business date per property timezone)
 *   DATABASE_URL=… npm run night-audit 2026-11-20 (explicit date)
 * Charges are attributed to each property's inactive is_system user.
 */
import { and, eq } from 'drizzle-orm';
import { createDb } from '$lib/server/db/client';
import { property, staffUser } from '$lib/server/db/schema';
import { executeCommand } from '$lib/server/cqrs/execute';
import { RunNightAudit } from '$lib/features/folio/run-night-audit/contract';
import { runNightAudit } from '$lib/features/folio/run-night-audit/handler.server';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const { db, close } = createDb(url, { max: 2 });

async function main() {
	const businessDate = process.argv[2];
	for (const p of await db.select().from(property)) {
		const [system] = await db
			.select()
			.from(staffUser)
			.where(and(eq(staffUser.propertyId, p.id), eq(staffUser.isSystem, true)));
		if (!system) {
			console.warn(`[${p.slug}] no night-audit system user — skipped`);
			continue;
		}
		// system actor: must not depend on the editable permission grid
		const actor = { userId: system.id, propertyId: p.id, role: 'ADMIN' as const, name: system.name, email: system.email };
		const r = await executeCommand(RunNightAudit, runNightAudit, { businessDate }, { db, actor });
		console.log(`[${p.slug}] ${r.businessDate}: posted ${r.posted} night(s) for ${r.reservations} in-house stay(s)`);
	}
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(close);
