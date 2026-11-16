import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { cents, id, shortText } from '$lib/shared/cqrs/schemas';
import { TAX_KINDS, TAX_SCOPES } from '$lib/shared/domain/enums';

export const UpsertTaxRule = command<{ taxRuleId: string }>()({
	name: 'setup.upsertTaxRule',
	path: '/api/setup/tax-rules',
	permission: 'setup.manage',
	input: z
		.object({
			id: id.optional(),
			name: shortText(60),
			kind: z.enum(TAX_KINDS),
			rateBp: z.number().int().min(0).max(10_000).default(0),
			amountCents: cents.default(0),
			appliesTo: z.enum(TAX_SCOPES).default('ALL'),
			inclusive: z.boolean().default(false),
			sortOrder: z.number().int().min(0).max(100).default(0),
			active: z.boolean().default(true)
		})
		.refine((v) => v.kind === 'PERCENT' || v.appliesTo === 'ROOM', { message: 'Fixed per-night taxes apply to room nights only', path: ['appliesTo'] })
		.refine((v) => !v.inclusive || v.kind === 'PERCENT', { message: 'Only percentage taxes can be price-inclusive', path: ['inclusive'] })
		.refine((v) => (v.kind === 'PERCENT' ? v.rateBp > 0 : v.amountCents > 0), { message: 'Enter a rate or amount', path: ['rateBp'] })
});
