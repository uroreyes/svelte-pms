import { eq } from 'drizzle-orm';
import { property } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import type { UpdatePropertySettings } from './contract';

export const updatePropertySettings: CommandHandler<typeof UpdatePropertySettings> = async (input, { db, actor }) => {
	await db.update(property).set(input).where(eq(property.id, actor.propertyId));
	return { propertyId: actor.propertyId };
};
