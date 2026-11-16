import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { nightsOf } from '$lib/shared/domain/dates';
import { reservation, roomBlock, roomInventoryDaily, roomUnit } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { conflict, invalid, notFound } from '$lib/server/cqrs/errors';
import { lockInventory } from '$lib/server/domain/inventory';
import { enqueueAri } from '$lib/server/domain/outbox';
import type { BlockRoom } from './contract';

/** Maintenance closure: takes the unit off the tape chart and one unit out of sellable inventory. */
export const blockRoom: CommandHandler<typeof BlockRoom> = async (input, { db, actor }) => {
	const nights = nightsOf(input.startDate, input.endDate);
	if (nights.length > 366) throw invalid('Blocks are limited to one year');
	const [unit] = await db
		.select()
		.from(roomUnit)
		.where(and(eq(roomUnit.id, input.roomUnitId), eq(roomUnit.propertyId, actor.propertyId)))
		.for('update');
	if (!unit) throw notFound('Room');

	const overlap = and(lt(reservation.checkIn, input.endDate), gt(reservation.checkOut, input.startDate));
	const [guestInRoom] = await db
		.select({ code: reservation.confirmationCode })
		.from(reservation)
		.where(and(eq(reservation.roomUnitId, unit.id), inArray(reservation.status, ['CONFIRMED', 'CHECKED_IN']), overlap))
		.limit(1);
	if (guestInRoom) throw conflict(`Room is allocated to ${guestInRoom.code} in that period — move the guest first`);

	const [existing] = await db
		.select({ id: roomBlock.id })
		.from(roomBlock)
		.where(and(eq(roomBlock.roomUnitId, unit.id), lt(roomBlock.startDate, input.endDate), gt(roomBlock.endDate, input.startDate)))
		.limit(1);
	if (existing) throw conflict('Room already has a closure overlapping those dates');

	const rows = await lockInventory(db, unit.roomTypeId, nights);
	const oversold = rows.filter((r) => r.availableCount - 1 < r.soldCount);
	if (oversold.length > 0) {
		throw conflict('Closing this room would oversell the room type', { dates: oversold.map((r) => r.date) });
	}
	await db
		.update(roomInventoryDaily)
		.set({ availableCount: sql`${roomInventoryDaily.availableCount} - 1`, updatedAt: new Date() })
		.where(inArray(roomInventoryDaily.id, rows.map((r) => r.id)));

	const [block] = await db
		.insert(roomBlock)
		.values({ ...input, propertyId: actor.propertyId, createdBy: actor.userId })
		.returning({ id: roomBlock.id });
	await enqueueAri(db, actor.propertyId, unit.roomTypeId, input.startDate, input.endDate);
	return { blockId: block!.id };
};
