import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, isoDate } from '$lib/shared/cqrs/schemas';
import { inventoryPatch } from '../patch';

export const SetDailyInventory = command<{ updated: number }>()({
	name: 'inventory.setDaily',
	path: '/api/inventory/daily',
	permission: 'inventory.manage',
	input: z.object({ roomTypeId: id, date: isoDate, patch: inventoryPatch })
});
