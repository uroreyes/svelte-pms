import type { CommandHandler } from '$lib/server/cqrs/execute';
import { conflict } from '$lib/server/cqrs/errors';
import { appendPayment } from '$lib/server/domain/folio';
import { loadPaymentForReversal } from '../payment-lookup.server';
import type { VoidPayment } from './contract';

/** Reverses a mistaken payment entry (e.g. keyed twice). Only untouched payments can be voided. */
export const voidPayment: CommandHandler<typeof VoidPayment> = async ({ paymentId, reason }, { db, actor }) => {
	const { payment, folio, siblings } = await loadPaymentForReversal(db, actor.propertyId, paymentId);
	if (payment.kind !== 'PAYMENT') throw conflict('Only original payments can be voided');
	if (siblings.some((s) => s.relatedPaymentId === payment.id)) throw conflict('Payment already has refunds or a void');
	const voidId = await appendPayment(db, folio, {
		method: payment.method,
		kind: 'VOID',
		amountCents: -payment.amountCents,
		referenceNo: payment.referenceNo,
		relatedPaymentId: payment.id,
		reason,
		staffUserId: actor.userId
	});
	return { voidId };
};
