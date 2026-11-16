import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { cents, id, shortText } from '$lib/shared/cqrs/schemas';
import { CHARGE_CATEGORIES } from '$lib/shared/domain/enums';

export const UpsertCatalogItem = command<{ catalogItemId: string }>()({
	name: 'setup.upsertCatalogItem',
	path: '/api/setup/catalog',
	permission: 'setup.manage',
	input: z.object({
		id: id.optional(),
		category: z.enum(CHARGE_CATEGORIES),
		name: shortText(80),
		unitPriceCents: cents,
		taxable: z.boolean().default(true),
		active: z.boolean().default(true)
	})
});
