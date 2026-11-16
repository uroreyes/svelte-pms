import { refundableCents } from '$lib/shared/domain/folio';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { conflict } from '$lib/server/cqrs/errors';
import { appendPayment } from '$lib/server/domain/folio';
import { loadPaymentForReversal } from '../payment-lookup.server';
import type { RefundPayment } from './contract';

export const refundPayment: CommandHandler<typeof RefundPayment> = async ({ paymentId, amountCents, reason }, { db, actor }) => {
	const { payment, folio, siblings } = await loadPaymentForReversal(db, actor.propertyId, paymentId);
	const available = refundableCents(payment, siblings);
	if (amountCents > available) throw conflict(`Only ${(available / 100).toFixed(2)} of this payment can be refunded`);
	const refundId = await appendPayment(db, folio, {
		method: payment.method,
		kind: 'REFUND',
		amountCents: -amountCents,
		referenceNo: payment.referenceNo,
		relatedPaymentId: payment.id,
		reason,
		staffUserId: actor.userId
	});
	return { refundId };
};
