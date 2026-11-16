import { and, asc, eq } from 'drizzle-orm';
import { folio, guest, reservation, roomUnit } from '$lib/server/db/schema';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import { notFound } from '$lib/server/cqrs/errors';
import type { FindInHouseRoom } from './contract';

export const findInHouseRoom: QueryHandler<typeof FindInHouseRoom> = async ({ roomNumber }, { db, actor }) => {
	const [row] = await db
		.select({ r: reservation, first: guest.firstName, last: guest.lastName, roomNumber: roomUnit.roomNumber })
		.from(reservation)
		.innerJoin(roomUnit, eq(roomUnit.id, reservation.roomUnitId))
		.innerJoin(guest, eq(guest.id, reservation.guestId))
		.where(and(eq(reservation.propertyId, actor.propertyId), eq(roomUnit.roomNumber, roomNumber), eq(reservation.status, 'CHECKED_IN')))
		.limit(1);
	if (!row) throw notFound(`Checked-in guest in room ${roomNumber}`);
	const folios = await db
		.select()
		.from(folio)
		.where(and(eq(folio.reservationId, row.r.id), eq(folio.status, 'OPEN')))
		.orderBy(asc(folio.createdAt));
	return {
		reservationId: row.r.id,
		confirmationCode: row.r.confirmationCode,
		guestName: `${row.last}, ${row.first}`,
		roomNumber: row.roomNumber,
		checkOut: row.r.checkOut,
		folios: folios.map((f) => ({ id: f.id, label: f.label, payerName: f.payerName, isPrimary: f.isPrimary }))
	};
};
