import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, isoDate } from '$lib/shared/cqrs/schemas';
import { diffDays } from '$lib/shared/domain/dates';
import { inventoryPatch } from '../patch';

export const BulkUpdateInventory = command<{ updated: number; dates: string[] }>()({
	name: 'inventory.bulkUpdate',
	path: '/api/inventory/bulk',
	permission: 'inventory.manage',
	input: z
		.object({
			roomTypeId: id,
			from: isoDate,
			/** inclusive */
			to: isoDate,
			/** 0 = Sun … 6 = Sat; empty = every day */
			daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
			patch: inventoryPatch
		})
		.refine((v) => v.to >= v.from, { message: 'End date must be on or after start date', path: ['to'] })
		.refine((v) => diffDays(v.from, v.to) <= 366, { message: 'Range is limited to one year', path: ['to'] })
});
