import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { cents, id, isoDate } from '$lib/shared/cqrs/schemas';
import { diffDays } from '$lib/shared/domain/dates';

export const BulkUpdateRatePlan = command<{ updated: number }>()({
	name: 'inventory.bulkUpdateRatePlan',
	path: '/api/inventory/rate-plan-bulk',
	permission: 'inventory.manage',
	input: z
		.object({
			ratePlanId: id,
			from: isoDate,
			to: isoDate,
			daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
			/** null clears the override (plan derives from the room-type rate again). */
			rateOverrideCents: cents.nullable().optional(),
			isClosed: z.boolean().optional()
		})
		.refine((v) => v.to >= v.from && diffDays(v.from, v.to) <= 366, { message: 'Range must be forward and at most one year', path: ['to'] })
		.refine((v) => v.rateOverrideCents !== undefined || v.isClosed !== undefined, { message: 'Provide a rate or a stop-sell change' })
});
