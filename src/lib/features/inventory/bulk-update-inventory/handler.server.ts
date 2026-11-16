import { expandRange } from '$lib/shared/domain/dates';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { applyInventoryPatch } from '../apply-patch.server';
import type { BulkUpdateInventory } from './contract';

export const bulkUpdateInventory: CommandHandler<typeof BulkUpdateInventory> = async (input, { db, actor, now }) => {
	const dates = expandRange(input.from, input.to, input.daysOfWeek);
	const updated = await applyInventoryPatch(db, actor.propertyId, input.roomTypeId, dates, input.patch, now);
	return { updated, dates };
};
