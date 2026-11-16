import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, shortText } from '$lib/shared/cqrs/schemas';

export const VoidPayment = command<{ voidId: string }>()({
	name: 'folio.voidPayment',
	path: '/api/folio/payments/void',
	permission: 'folio.voidPayment',
	input: z.object({ paymentId: id, reason: shortText(200) })
});
