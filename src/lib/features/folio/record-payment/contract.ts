import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, optionalText, positiveCents } from '$lib/shared/cqrs/schemas';
import { PAYMENT_METHODS } from '$lib/shared/domain/enums';

export const RecordPayment = command<{ paymentId: string; balanceCents: number }>()({
	name: 'folio.recordPayment',
	path: '/api/folio/payments',
	permission: 'folio.manage',
	input: z.object({ folioId: id, method: z.enum(PAYMENT_METHODS), amountCents: positiveCents, referenceNo: optionalText(80) })
});
