/** Guards shared by every slice that puts a guest into a physical room (assign, check-in). */
import { and, eq, gt, inArray, lt, ne } from 'drizzle-orm';
import type { Tx } from '$lib/server/db/client';
import { reservation, roomBlock, roomUnit } from '$lib/server/db/schema';
import { conflict, invalid, notFound } from '$lib/server/cqrs/errors';
import type { ReservationRow } from '$lib/server/domain/reservations';

/** Locks the unit and verifies it can host the reservation's dates. */
export async function lockAssignableUnit(tx: Tx, res: Pick<ReservationRow, 'id' | 'propertyId' | 'roomTypeId' | 'checkIn' | 'checkOut'>, roomUnitId: string, opts: { anyType?: boolean } = {}) {
	const [unit] = await tx
		.select()
		.from(roomUnit)
		.where(and(eq(roomUnit.id, roomUnitId), eq(roomUnit.propertyId, res.propertyId)))
		.for('update');
	if (!unit) throw notFound('Room');
	if (!opts.anyType && unit.roomTypeId !== res.roomTypeId) throw invalid('Room belongs to a different room type');
	if (unit.housekeepingStatus === 'OUT_OF_ORDER') throw conflict(`Room ${unit.roomNumber} is out of order`);

	const [blocked] = await tx
		.select({ id: roomBlock.id })
		.from(roomBlock)
		.where(and(eq(roomBlock.roomUnitId, unit.id), lt(roomBlock.startDate, res.checkOut), gt(roomBlock.endDate, res.checkIn)))
		.limit(1);
	if (blocked) throw conflict(`Room ${unit.roomNumber} is closed for maintenance on those dates`);

	const [clash] = await tx
		.select({ code: reservation.confirmationCode })
		.from(reservation)
		.where(
			and(
				eq(reservation.roomUnitId, unit.id),
				ne(reservation.id, res.id),
				inArray(reservation.status, ['CONFIRMED', 'CHECKED_IN']),
				lt(reservation.checkIn, res.checkOut),
				gt(reservation.checkOut, res.checkIn)
			)
		)
		.limit(1);
	if (clash) throw conflict(`Room ${unit.roomNumber} is already allocated to ${clash.code} for overlapping dates`);
	return unit;
}
