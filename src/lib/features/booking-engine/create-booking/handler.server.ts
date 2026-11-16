import { eq } from 'drizzle-orm';
import { booking, guest } from '$lib/server/db/schema';
import type { Tx } from '$lib/server/db/client';
import type { PublicCommandHandler } from '$lib/server/cqrs/execute';
import { conflict, invalid } from '$lib/server/cqrs/errors';
import { businessDate, loadPropertyBySlug } from '$lib/server/domain/property';
import { createReservation, uniqueConfirmationCode } from '$lib/server/domain/reservations';
import type { CreateBooking } from './contract';

async function bookingCode(tx: Tx): Promise<string> {
	for (let i = 0; i < 5; i++) {
		const code = await uniqueConfirmationCode(tx); // unique among reservations
		const [hit] = await tx.select({ id: booking.id }).from(booking).where(eq(booking.confirmationCode, code)).limit(1);
		if (!hit) return code;
	}
	throw new Error('Could not allocate a booking code');
}

/**
 * Instant direct booking for 1–5 rooms. All rooms succeed or none do (one transaction).
 * Rooms are processed in room-type order so concurrent multi-room bookings lock inventory consistently.
 */
export const createBooking: PublicCommandHandler<typeof CreateBooking> = async ({ property, rooms, guest: g, ...input }, { db, now }) => {
	const p = await loadPropertyBySlug(db, property);
	if (input.checkIn < businessDate(p, now)) throw invalid('Check-in cannot be in the past');

	const [guestRow] = await db
		.insert(guest)
		.values({ propertyId: p.id, firstName: g.firstName, lastName: g.lastName, email: g.email, phone: g.phone ?? null })
		.returning({ id: guest.id });
	const [b] = await db
		.insert(booking)
		.values({ propertyId: p.id, confirmationCode: await bookingCode(db), guestId: guestRow!.id, source: 'DIRECT' })
		.returning();

	const ordered = rooms.map((r, i) => ({ ...r, i })).sort((a, b2) => a.roomTypeId.localeCompare(b2.roomTypeId) || a.i - b2.i);
	const created: { i: number; confirmationCode: string; totalCents: number }[] = [];
	for (const r of ordered) {
		const res = await createReservation(db, {
			propertyId: p.id,
			roomTypeId: r.roomTypeId,
			ratePlanId: r.ratePlanId ?? null,
			checkIn: input.checkIn,
			checkOut: input.checkOut,
			adults: r.adults,
			children: r.children,
			guest: g,
			guestId: guestRow!.id,
			bookingId: b!.id,
			source: 'DIRECT',
			notes: input.notes,
			overbookPolicy: 'reject'
		});
		created.push({ i: r.i, confirmationCode: res.confirmationCode, totalCents: res.totalCents });
	}
	const totalCents = created.reduce((s, c) => s + c.totalCents, 0);
	if (totalCents !== input.expectedTotalCents) {
		throw conflict('The price for this stay has changed — please review the new total', { totalCents });
	}
	return {
		confirmationCode: b!.confirmationCode,
		totalCents,
		rooms: created.sort((a, c) => a.i - c.i).map(({ confirmationCode, totalCents: t }) => ({ confirmationCode, totalCents: t }))
	};
};
