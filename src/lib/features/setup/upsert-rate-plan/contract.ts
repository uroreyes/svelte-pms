import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { cents, id, shortText } from '$lib/shared/cqrs/schemas';
import { RATE_ADJUSTMENTS } from '$lib/shared/domain/enums';

export const UpsertRatePlan = command<{ ratePlanId: string }>()({
	name: 'setup.upsertRatePlan',
	path: '/api/setup/rate-plans',
	permission: 'setup.manage',
	input: z
		.object({
			id: id.optional(),
			roomTypeId: id,
			name: shortText(60),
			code: z.string().trim().regex(/^[A-Z0-9_-]{1,20}$/, 'Use A–Z, 0–9, _ or - (max 20)'),
			description: z.string().trim().max(500).default(''),
			adjustmentKind: z.enum(RATE_ADJUSTMENTS).default('NONE'),
			/** PERCENT: basis points (−1000 = −10%). FIXED: cents per night. */
			adjustmentValue: z.number().int().min(-1_000_000).max(1_000_000).default(0),
			includedOccupancy: z.number().int().min(1).max(20),
			extraAdultCents: cents.default(0),
			extraChildCents: cents.default(0),
			refundable: z.boolean().default(true),
			freeCancellationDays: z.number().int().min(0).max(365).nullable().default(null),
			breakfastIncluded: z.boolean().default(false),
			minLos: z.number().int().min(1).max(60).nullable().default(null),
			isDefault: z.boolean().default(false),
			active: z.boolean().default(true)
		})
		.refine((v) => v.adjustmentKind !== 'PERCENT' || v.adjustmentValue >= -10_000, { message: 'Discount cannot exceed 100%', path: ['adjustmentValue'] })
		.refine((v) => !(v.isDefault && !v.active), { message: 'The default plan must be active', path: ['active'] })
});
