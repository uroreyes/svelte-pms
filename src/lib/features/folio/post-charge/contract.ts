import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, positiveCents, shortText } from '$lib/shared/cqrs/schemas';
import { CHARGE_CATEGORIES } from '$lib/shared/domain/enums';

export const chargeLine = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('catalog'), catalogItemId: id }),
	z.object({
		kind: z.literal('custom'),
		category: z.enum(CHARGE_CATEGORIES).exclude(['ROOM']),
		description: shortText(120),
		unitPriceCents: positiveCents,
		taxable: z.boolean().default(true)
	}),
	/** Pre-tax discount; front office only. */
	z.object({ kind: z.literal('discount'), description: shortText(120), amountCents: positiveCents })
]);

export const PostCharge = command<{ itemId: string; totalCents: number }>()({
	name: 'folio.postCharge',
	path: '/api/folio/charges',
	permission: 'pos.post',
	input: z.object({
		folioId: id,
		quantity: z.number().int().min(1).max(99).default(1),
		line: chargeLine
	})
});
