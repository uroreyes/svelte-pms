import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { guest, reservation, roomType, roomUnit } from '$lib/server/db/schema';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import { businessDate, loadProperty } from '$lib/server/domain/property';
import type { GetRoomBoard } from './contract';

export const getRoomBoard: QueryHandler<typeof GetRoomBoard> = async (_input, { db, actor, now }) => {
	const today = businessDate(await loadProperty(db, actor.propertyId), now);
	const [units, stays] = await Promise.all([
		db
			.select({ id: roomUnit.id, roomNumber: roomUnit.roomNumber, floor: roomUnit.floor, status: roomUnit.housekeepingStatus, typeName: roomType.name })
			.from(roomUnit)
			.innerJoin(roomType, eq(roomType.id, roomUnit.roomTypeId))
			.where(eq(roomUnit.propertyId, actor.propertyId))
			.orderBy(asc(roomUnit.floor), asc(roomUnit.roomNumber)),
		db
			.select({
				id: reservation.id,
				roomUnitId: reservation.roomUnitId,
				status: reservation.status,
				checkIn: reservation.checkIn,
				checkOut: reservation.checkOut,
				first: guest.firstName,
				last: guest.lastName
			})
			.from(reservation)
			.innerJoin(guest, eq(guest.id, reservation.guestId))
			.where(
				and(
					eq(reservation.propertyId, actor.propertyId),
					or(eq(reservation.status, 'CHECKED_IN'), and(eq(reservation.status, 'CONFIRMED'), eq(reservation.checkIn, today))),
					inArray(reservation.status, ['CHECKED_IN', 'CONFIRMED'])
				)
			)
	]);
	return {
		businessDate: today,
		rooms: units.map((u) => {
			const inHouse = stays.find((s) => s.roomUnitId === u.id && s.status === 'CHECKED_IN');
			const arriving = stays.find((s) => s.roomUnitId === u.id && s.status === 'CONFIRMED');
			return {
				id: u.id,
				roomNumber: u.roomNumber,
				floor: u.floor,
				roomTypeName: u.typeName,
				housekeepingStatus: u.status,
				occupant: inHouse ? { reservationId: inHouse.id, guestName: `${inHouse.last}, ${inHouse.first}`, checkOut: inHouse.checkOut } : null,
				arrivalToday: arriving ? { reservationId: arriving.id, guestName: `${arriving.last}, ${arriving.first}` } : null
			};
		})
	};
};
