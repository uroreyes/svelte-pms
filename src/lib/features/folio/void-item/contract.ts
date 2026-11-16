import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, shortText } from '$lib/shared/cqrs/schemas';

export const VoidItem = command<{ reversalItemId: string }>()({
	name: 'folio.voidItem',
	path: '/api/folio/charges/void',
	permission: 'folio.manage',
	input: z.object({ itemId: id, reason: shortText(200) })
});
