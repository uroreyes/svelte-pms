import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { booking, guest, ratePlan, reservation, reservationNight, roomType } from '$lib/server/db/schema';
import type { PublicQueryHandler } from '$lib/server/cqrs/execute';
import { notFound } from '$lib/server/cqrs/errors';
import { loadPropertyBySlug } from '$lib/server/domain/property';
import type { GetConfirmation } from './contract';

export const getConfirmation: PublicQueryHandler<typeof GetConfirmation> = async ({ property, code, lastName }, { db }) => {
	const p = await loadPropertyBySlug(db, property);
	const [b] = await db.select({ id: booking.id }).from(booking).where(and(eq(booking.propertyId, p.id), eq(booking.confirmationCode, code)));
	const rows = await db
		.select({ r: reservation, first: guest.firstName, last: guest.lastName, typeName: roomType.name, planName: ratePlan.name })
		.from(reservation)
		.innerJoin(guest, eq(guest.id, reservation.guestId))
		.innerJoin(roomType, eq(roomType.id, reservation.roomTypeId))
		.leftJoin(ratePlan, eq(ratePlan.id, reservation.ratePlanId))
		.where(
			and(
				eq(reservation.propertyId, p.id),
				b ? eq(reservation.bookingId, b.id) : or(eq(reservation.confirmationCode, code)),
				sql`lower(${guest.lastName}) = lower(${lastName})`
			)
		)
		.orderBy(asc(reservation.createdAt));
	if (rows.length === 0) throw notFound('Booking');
	const nights = await db
		.select()
		.from(reservationNight)
		.where(inArray(reservationNight.reservationId, rows.map((x) => x.r.id)))
		.orderBy(asc(reservationNight.date));
	const first = rows[0]!;
	return {
		propertyName: p.name,
		currency: p.currency,
		confirmationCode: code,
		guestName: `${first.first} ${first.last}`,
		checkIn: rows.reduce((m, x) => (x.r.checkIn < m ? x.r.checkIn : m), first.r.checkIn),
		checkOut: rows.reduce((m, x) => (x.r.checkOut > m ? x.r.checkOut : m), first.r.checkOut),
		totalCents: rows.reduce((s, x) => s + x.r.quotedTotalCents, 0),
		rooms: rows.map(({ r, typeName, planName }) => ({
			confirmationCode: r.confirmationCode,
			roomTypeName: typeName,
			ratePlanName: planName ?? 'Standard rate',
			adults: r.adults,
			children: r.children,
			status: r.status,
			totalCents: r.quotedTotalCents,
			nights: nights.filter((n) => n.reservationId === r.id).map((n) => ({ date: n.date, rateCents: n.rateCents }))
		}))
	};
};
