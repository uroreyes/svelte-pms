import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, optionalText, shortText } from '$lib/shared/cqrs/schemas';

export const UpdateFolioBilling = command<{ folioId: string }>()({
	name: 'folio.updateBilling',
	path: '/api/folio/billing',
	permission: 'folio.manage',
	input: z.object({
		folioId: id,
		payerName: shortText(120),
		companyName: optionalText(160),
		taxId: optionalText(40),
		billingAddress: optionalText(400)
	})
});
