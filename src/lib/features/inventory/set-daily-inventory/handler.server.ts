import type { CommandHandler } from '$lib/server/cqrs/execute';
import { applyInventoryPatch } from '../apply-patch.server';
import type { SetDailyInventory } from './contract';

export const setDailyInventory: CommandHandler<typeof SetDailyInventory> = async ({ roomTypeId, date, patch }, { db, actor, now }) => ({
	updated: await applyInventoryPatch(db, actor.propertyId, roomTypeId, [date], patch, now)
});
