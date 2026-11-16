import { ratePlan, roomType } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import type { CreateRoomType } from './contract';

export const createRoomType: CommandHandler<typeof CreateRoomType> = async (input, { db, actor }) => {
	const [row] = await db
		.insert(roomType)
		.values({ ...input, propertyId: actor.propertyId })
		.returning({ id: roomType.id });
	// Every room type starts with a default plan reproducing the base rate for up to max occupancy.
	await db.insert(ratePlan).values({ propertyId: actor.propertyId, roomTypeId: row!.id, name: 'Standard rate', code: 'STD', includedOccupancy: input.maxOccupancy, isDefault: true });
	return { roomTypeId: row!.id };
};
