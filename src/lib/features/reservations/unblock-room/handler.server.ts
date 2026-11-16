import { and, eq, inArray, sql } from 'drizzle-orm';
import { nightsOf } from '$lib/shared/domain/dates';
import { roomBlock, roomInventoryDaily, roomUnit } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { notFound } from '$lib/server/cqrs/errors';
import { lockInventory } from '$lib/server/domain/inventory';
import { enqueueAri } from '$lib/server/domain/outbox';
import type { UnblockRoom } from './contract';

export const unblockRoom: CommandHandler<typeof UnblockRoom> = async ({ blockId }, { db, actor }) => {
	const [block] = await db
		.select({ b: roomBlock, roomTypeId: roomUnit.roomTypeId })
		.from(roomBlock)
		.innerJoin(roomUnit, eq(roomUnit.id, roomBlock.roomUnitId))
		.where(and(eq(roomBlock.id, blockId), eq(roomBlock.propertyId, actor.propertyId)))
		.for('update', { of: roomBlock });
	if (!block) throw notFound('Room closure');

	const rows = await lockInventory(db, block.roomTypeId, nightsOf(block.b.startDate, block.b.endDate));
	await db
		.update(roomInventoryDaily)
		.set({ availableCount: sql`${roomInventoryDaily.availableCount} + 1`, updatedAt: new Date() })
		.where(inArray(roomInventoryDaily.id, rows.map((r) => r.id)));
	await db.delete(roomBlock).where(eq(roomBlock.id, blockId));
	await enqueueAri(db, actor.propertyId, block.roomTypeId, block.b.startDate, block.b.endDate);
	return { blockId };
};
