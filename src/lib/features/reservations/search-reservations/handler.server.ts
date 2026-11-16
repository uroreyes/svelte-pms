import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { likePattern } from '$lib/shared/cqrs/schemas';
import { booking, guest, reservation, roomType, roomUnit } from '$lib/server/db/schema';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import type { SearchReservations } from './contract';

export const searchReservations: QueryHandler<typeof SearchReservations> = async ({ q, arrival, status, limit }, { db, actor }) => {
	const filters: SQL[] = [eq(reservation.propertyId, actor.propertyId)];
	if (q) {
		const pattern = likePattern(q);
		filters.push(
			or(
				eq(reservation.confirmationCode, q.toUpperCase()),
				eq(booking.confirmationCode, q.toUpperCase()),
				ilike(guest.lastName, pattern),
				ilike(guest.firstName, pattern),
				ilike(sql`${guest.firstName} || ' ' || ${guest.lastName}`, pattern)
			)!
		);
	}
	if (arrival) filters.push(eq(reservation.checkIn, arrival));
	if (status) filters.push(eq(reservation.status, status));

	const rows = await db
		.select({
			id: reservation.id,
			confirmationCode: reservation.confirmationCode,
			first: guest.firstName,
			last: guest.lastName,
			roomTypeName: roomType.name,
			roomNumber: roomUnit.roomNumber,
			checkIn: reservation.checkIn,
			checkOut: reservation.checkOut,
			status: reservation.status,
			source: reservation.source,
			overbooked: reservation.overbooked
		})
		.from(reservation)
		.innerJoin(guest, eq(guest.id, reservation.guestId))
		.innerJoin(roomType, eq(roomType.id, reservation.roomTypeId))
		.leftJoin(roomUnit, eq(roomUnit.id, reservation.roomUnitId))
		.leftJoin(booking, eq(booking.id, reservation.bookingId))
		.where(and(...filters))
		.orderBy(desc(reservation.checkIn), desc(reservation.createdAt))
		.limit(limit);

	return { items: rows.map(({ first, last, ...r }) => ({ ...r, guestName: `${last}, ${first}` })) };
};
