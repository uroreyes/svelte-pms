import { formatMoney } from '$lib/shared/domain/money';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { conflict } from '$lib/server/cqrs/errors';
import { appendPayment, lockFolio } from '$lib/server/domain/folio';
import { loadProperty } from '$lib/server/domain/property';
import type { RecordPayment } from './contract';

/** Partial or full payment. Overpayment is rejected to keep Balance Due ≥ 0. */
export const recordPayment: CommandHandler<typeof RecordPayment> = async (input, { db, actor }) => {
	const f = await lockFolio(db, actor.propertyId, input.folioId);
	if (input.amountCents > f.balanceCents) {
		const p = await loadProperty(db, actor.propertyId);
		throw conflict(`Payment exceeds the balance due (${formatMoney(Math.max(0, f.balanceCents), p.currency)})`);
	}
	const paymentId = await appendPayment(db, f, {
		method: input.method,
		kind: 'PAYMENT',
		amountCents: input.amountCents,
		referenceNo: input.referenceNo ?? null,
		staffUserId: actor.userId
	});
	return { paymentId, balanceCents: f.balanceCents - input.amountCents };
};
