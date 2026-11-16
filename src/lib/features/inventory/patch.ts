/** Module-level schema shared by the two inventory write slices. */
import { z } from 'zod';
import { cents } from '$lib/shared/cqrs/schemas';

export const inventoryPatch = z
	.object({
		availableCount: z.number().int().min(0).max(999).optional(),
		/** null clears the override (falls back to base rate) */
		rateOverrideCents: cents.nullable().optional(),
		/** null clears the restriction */
		minLos: z.number().int().min(1).max(60).nullable().optional(),
		isClosed: z.boolean().optional()
	})
	.refine((p) => Object.values(p).some((v) => v !== undefined), { message: 'Provide at least one field to change' });

export type InventoryPatch = z.output<typeof inventoryPatch>;
