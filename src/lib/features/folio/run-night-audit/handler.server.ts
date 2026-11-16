import { loadTaxRules } from '$lib/server/domain/taxes';
import { and, eq, gt, lt, lte } from 'drizzle-orm';
import { reservation } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { lockReservationFolios, postRoomNights } from '$lib/server/domain/folio';
import { businessDate, loadProperty } from '$lib/server/domain/property';
import { lockReservation, markNoShow } from '$lib/server/domain/reservations';
import type { RunNightAudit } from './contract';

/**
 * End-of-day for a business date:
 *  1. post the night's room + tax for every in-house guest (idempotent per night);
 *  2. mark arrivals dated *before* this business date that never checked in as NO_SHOW (late arrivals today are safe);
 *  3. count overstays so the front desk can extend or check them out.
 */
export const runNightAudit: CommandHandler<typeof RunNightAudit> = async (input, { db, actor, now }) => {
	const p = await loadProperty(db, actor.propertyId);
	const date = input.businessDate ?? businessDate(p, now);

	const inHouse = await db
		.select({ id: reservation.id })
		.from(reservation)
		.where(and(eq(reservation.propertyId, p.id), eq(reservation.status, 'CHECKED_IN'), lte(reservation.checkIn, date), gt(reservation.checkOut, date)))
		.orderBy(reservation.id);
	const taxRules = await loadTaxRules(db, p);
	let posted = 0;
	for (const { id } of inHouse) {
		const res = await lockReservation(db, p.id, id);
		const folios = await lockReservationFolios(db, id);
		posted += await postRoomNights(db, { reservation: res, folios, dates: [date], taxRules, staffUserId: actor.userId });
	}

	const missed = await db
		.select({ id: reservation.id })
		.from(reservation)
		.where(and(eq(reservation.propertyId, p.id), eq(reservation.status, 'CONFIRMED'), lt(reservation.checkIn, date)))
		.orderBy(reservation.id);
	for (const { id } of missed) await markNoShow(db, await lockReservation(db, p.id, id), now);

	const overstays = await db
		.select({ id: reservation.id })
		.from(reservation)
		.where(and(eq(reservation.propertyId, p.id), eq(reservation.status, 'CHECKED_IN'), lte(reservation.checkOut, date)));

	return { businessDate: date, reservations: inHouse.length, posted, noShows: missed.length, overstays: overstays.length };
};
