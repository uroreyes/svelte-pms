import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, optionalText, positiveCents } from '$lib/shared/cqrs/schemas';
import { PAYMENT_METHODS } from '$lib/shared/domain/enums';

export const CheckOut = command<{ reservationId: string; invoices: { folioId: string; invoiceNumber: string }[]; releasedNights: string[] }>()({
	name: 'frontDesk.checkOut',
	path: '/api/front-desk/check-out',
	permission: 'frontDesk.manage',
	input: z.object({
		reservationId: id,
		/** Optional final settlement (full or split across folios / methods). */
		payments: z
			.array(z.object({ folioId: id, method: z.enum(PAYMENT_METHODS), amountCents: positiveCents, referenceNo: optionalText(80) }))
			.max(10)
			.default([]),
		/**
		 * Early departure: shorten the stay to today, release the unused nights to inventory/OTAs and
		 * void any room charges already posted for them. When false, the full booked stay is billed.
		 */
		releaseUnusedNights: z.boolean().default(false),
		/** Pay every folio's remaining positive balance (computed after any early-departure release) with one method. */
		settleWith: z.object({ method: z.enum(PAYMENT_METHODS), referenceNo: optionalText(80) }).optional()
	})
});
