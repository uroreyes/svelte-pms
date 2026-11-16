import { and, asc, eq, gt, inArray, lt } from 'drizzle-orm';
import { addDays, dayOfWeek, nightsOf } from '$lib/shared/domain/dates';
import { guest, reservation, roomBlock, roomType, roomUnit } from '$lib/server/db/schema';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import { businessDate, loadProperty } from '$lib/server/domain/property';
import type { GetTapeChart, TapeBar } from './contract';
import { packLanes, placeBar } from './layout';

export const getTapeChart: QueryHandler<typeof GetTapeChart> = async (input, { db, actor, now }) => {
	const p = await loadProperty(db, actor.propertyId);
	const today = businessDate(p, now);
	const start = input.start ?? addDays(today, -2);
	const end = addDays(start, input.days);

	const [types, units, stays, blocks] = await Promise.all([
		db.select().from(roomType).where(eq(roomType.propertyId, p.id)).orderBy(asc(roomType.name)),
		db.select().from(roomUnit).where(eq(roomUnit.propertyId, p.id)).orderBy(asc(roomUnit.roomNumber)),
		db
			.select({ r: reservation, first: guest.firstName, last: guest.lastName })
			.from(reservation)
			.innerJoin(guest, eq(guest.id, reservation.guestId))
			.where(
				and(
					eq(reservation.propertyId, p.id),
					inArray(reservation.status, ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT']),
					lt(reservation.checkIn, end),
					gt(reservation.checkOut, start)
				)
			),
		db
			.select()
			.from(roomBlock)
			.where(and(eq(roomBlock.propertyId, p.id), lt(roomBlock.startDate, end), gt(roomBlock.endDate, start)))
	]);

	const resBars = stays.map(({ r, first, last }) => ({
		unitId: r.roomUnitId,
		typeId: r.roomTypeId,
		checkIn: r.checkIn,
		checkOut: r.checkOut,
		bar: {
			kind: 'reservation',
			id: r.id,
			label: `${last}, ${first}`,
			status: r.status,
			overbooked: r.overbooked,
			checkIn: r.checkIn,
			checkOut: r.checkOut,
			...placeBar(start, input.days, r)
		} satisfies TapeBar
	}));
	const blockBars = blocks.map((b) => ({
		unitId: b.roomUnitId,
		bar: {
			kind: 'block',
			id: b.id,
			label: b.reason,
			status: 'MAINTENANCE',
			overbooked: false,
			checkIn: b.startDate,
			checkOut: b.endDate,
			...placeBar(start, input.days, { checkIn: b.startDate, checkOut: b.endDate })
		} satisfies TapeBar
	}));

	return {
		start,
		days: input.days,
		businessDate: today,
		dates: nightsOf(start, end).map((date) => ({ date, dow: dayOfWeek(date) })),
		groups: types.map((t) => ({
			roomType: { id: t.id, name: t.name },
			rooms: units
				.filter((u) => u.roomTypeId === t.id)
				.map((u) => ({
					id: u.id,
					roomNumber: u.roomNumber,
					housekeepingStatus: u.housekeepingStatus,
					bars: [...resBars.filter((b) => b.unitId === u.id), ...blockBars.filter((b) => b.unitId === u.id)].map((b) => b.bar)
				})),
			unallocated: packLanes(resBars.filter((b) => b.typeId === t.id && !b.unitId)).map((lane) => lane.map((b) => b.bar))
		}))
	};
};
