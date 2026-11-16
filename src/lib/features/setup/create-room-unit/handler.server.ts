import { and, eq, gte, sql } from 'drizzle-orm';
import { roomInventoryDaily, roomType, roomUnit } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { notFound } from '$lib/server/cqrs/errors';
import { businessDate, loadProperty } from '$lib/server/domain/property';
import type { CreateRoomUnit } from './contract';

export const createRoomUnit: CommandHandler<typeof CreateRoomUnit> = async (input, { db, actor, now }) => {
	const [type] = await db
		.select({ id: roomType.id })
		.from(roomType)
		.where(and(eq(roomType.id, input.roomTypeId), eq(roomType.propertyId, actor.propertyId)));
	if (!type) throw notFound('Room type');

	const [row] = await db
		.insert(roomUnit)
		.values({ ...input, propertyId: actor.propertyId })
		.returning({ id: roomUnit.id });

	// A new physical room adds one sellable unit to every already-materialised future date.
	const today = businessDate(await loadProperty(db, actor.propertyId), now);
	await db
		.update(roomInventoryDaily)
		.set({ availableCount: sql`${roomInventoryDaily.availableCount} + 1`, updatedAt: now })
		.where(and(eq(roomInventoryDaily.roomTypeId, type.id), gte(roomInventoryDaily.date, today)));

	return { roomUnitId: row!.id };
};
