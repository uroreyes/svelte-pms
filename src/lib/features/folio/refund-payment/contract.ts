import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, positiveCents, shortText } from '$lib/shared/cqrs/schemas';

export const RefundPayment = command<{ refundId: string }>()({
	name: 'folio.refundPayment',
	path: '/api/folio/payments/refund',
	permission: 'folio.manage',
	input: z.object({ paymentId: id, amountCents: positiveCents, reason: shortText(200) })
});
