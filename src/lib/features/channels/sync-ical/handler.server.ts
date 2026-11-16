import { and, eq, gt, like } from 'drizzle-orm';
import { parseCalendar, type CalendarEvent } from '$lib/shared/domain/ical';
import type { ReservationSource } from '$lib/shared/domain/enums';
import { channelMapping, reservation } from '$lib/server/db/schema';
import type { NonTxCommandHandler } from '$lib/server/cqrs/execute';
import { conflict, invalid, notFound } from '$lib/server/cqrs/errors';
import { businessDate, loadProperty } from '$lib/server/domain/property';
import { cancelReservation, createReservation, lockReservation, MAX_STAY_NIGHTS } from '$lib/server/domain/reservations';
import { diffDays } from '$lib/shared/domain/dates';
import type { SyncIcal } from './contract';

export type CalendarFetcher = (url: string) => Promise<string>;

/**
 * iCal import for smaller OTAs: each future VEVENT becomes a reservation (externalRef = mapping:uid);
 * events that disappear from the feed cancel their reservation. One short tx per change.
 */
export function makeSyncIcal(fetchCalendar: CalendarFetcher): NonTxCommandHandler<typeof SyncIcal> {
	return async ({ mappingId }, { db, actor, now }) => {
		const [mapping] = await db
			.select()
			.from(channelMapping)
			.where(and(eq(channelMapping.id, mappingId), eq(channelMapping.propertyId, actor.propertyId)));
		if (!mapping) throw notFound('Channel mapping');
		if (!mapping.icalUrl) throw invalid('This mapping has no iCal import URL');

		let events: CalendarEvent[];
		try {
			events = parseCalendar(await fetchCalendar(mapping.icalUrl));
		} catch (e) {
			const message = e instanceof Error ? e.message : 'fetch failed';
			await db.update(channelMapping).set({ lastSyncError: message.slice(0, 500) }).where(eq(channelMapping.id, mapping.id));
			throw conflict(`iCal fetch failed: ${message}`);
		}

		const p = await loadProperty(db, actor.propertyId);
		const today = businessDate(p, now);
		const source: ReservationSource = mapping.channelName;
		const prefix = `${mapping.id}:`;
		const live = events.filter((e) => !e.cancelled && e.end > today && diffDays(e.start, e.end) <= MAX_STAY_NIGHTS);
		const liveRefs = new Set(live.map((e) => prefix + e.uid));

		const known = await db
			.select({ id: reservation.id, ref: reservation.externalRef, status: reservation.status })
			.from(reservation)
			.where(and(eq(reservation.propertyId, p.id), eq(reservation.source, source), like(reservation.externalRef, `${prefix}%`), gt(reservation.checkOut, today)));
		const knownRefs = new Set(known.map((k) => k.ref));

		const tally = { created: 0, cancelled: 0, unchanged: 0, overbooked: 0 };
		for (const e of live) {
			if (knownRefs.has(prefix + e.uid)) {
				tally.unchanged++;
				continue;
			}
			const created = await db.transaction((tx) =>
				createReservation(tx, {
					propertyId: p.id,
					roomTypeId: mapping.roomTypeId,
					checkIn: e.start < today ? today : e.start,
					checkOut: e.end,
					adults: 1,
					children: 0,
					guest: { firstName: mapping.channelName, lastName: (e.summary || 'Reserved').slice(0, 60) },
					source,
					externalRef: prefix + e.uid,
					notes: `Imported from iCal (${mapping.channelName})`,
					ratePlanId: mapping.ratePlanId,
					overbookPolicy: 'flag'
				})
			);
			tally.created++;
			if (created.overbooked) tally.overbooked++;
		}
		for (const k of known) {
			if (k.status !== 'CONFIRMED' || liveRefs.has(k.ref ?? '')) continue;
			await db.transaction(async (tx) => cancelReservation(tx, await lockReservation(tx, p.id, k.id), now));
			tally.cancelled++;
		}
		await db.update(channelMapping).set({ lastSyncedAt: now, lastSyncError: null }).where(eq(channelMapping.id, mapping.id));
		return tally;
	};
}
