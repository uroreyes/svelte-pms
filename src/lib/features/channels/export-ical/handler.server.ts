import { eq } from 'drizzle-orm';
import { addDays } from '$lib/shared/domain/dates';
import { remainingOf } from '$lib/shared/domain/availability';
import { serializeCalendar, type CalendarEvent } from '$lib/shared/domain/ical';
import type { DB } from '$lib/server/db/client';
import { channelMapping, roomType } from '$lib/server/db/schema';
import { readInventory } from '$lib/server/domain/inventory';
import { businessDate, loadProperty } from '$lib/server/domain/property';

const HORIZON_DAYS = 365;

/**
 * iCal fallback export: one all-day event per run of unsellable dates (sold out or closed).
 * Contains no guest PII. Returns null for unknown/inactive tokens.
 */
export async function exportIcal(db: DB, token: string, now: Date): Promise<string | null> {
	if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
	const [row] = await db
		.select({ m: channelMapping, typeName: roomType.name })
		.from(channelMapping)
		.innerJoin(roomType, eq(roomType.id, channelMapping.roomTypeId))
		.where(eq(channelMapping.exportToken, token));
	if (!row || !row.m.active) return null;

	const p = await loadProperty(db, row.m.propertyId);
	const from = businessDate(p, now);
	const days = (await readInventory(db, p.id, from, addDays(from, HORIZON_DAYS), [row.m.roomTypeId])).get(row.m.roomTypeId) ?? [];

	const events: CalendarEvent[] = [];
	let runStart: string | null = null;
	for (const [i, d] of days.entries()) {
		const blocked = d.isClosed || remainingOf(d) <= 0;
		if (blocked && !runStart) runStart = d.date;
		const last = i === days.length - 1;
		if (runStart && (!blocked || last)) {
			const end = blocked ? addDays(d.date, 1) : d.date;
			events.push({ uid: `${runStart}-${row.m.id}@hotel-pms`, start: runStart, end, summary: 'Not available' });
			runStart = null;
		}
	}
	return serializeCalendar(`${p.name} – ${row.typeName}`, events, now);
}
