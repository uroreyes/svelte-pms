import { and, eq } from 'drizzle-orm';
import { roomUnit } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { notFound } from '$lib/server/cqrs/errors';
import type { SetRoomStatus } from './contract';

export const setRoomStatus: CommandHandler<typeof SetRoomStatus> = async ({ roomUnitId, status }, { db, actor }) => {
	const [row] = await db
		.update(roomUnit)
		.set({ housekeepingStatus: status })
		.where(and(eq(roomUnit.id, roomUnitId), eq(roomUnit.propertyId, actor.propertyId)))
		.returning({ id: roomUnit.id });
	if (!row) throw notFound('Room');
	return { roomUnitId: row.id };
};
