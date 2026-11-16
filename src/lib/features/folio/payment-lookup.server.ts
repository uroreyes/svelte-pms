/** Module-level helper for the payment-reversal slices. */
import { eq } from 'drizzle-orm';
import type { Tx } from '$lib/server/db/client';
import { folioPayment } from '$lib/server/db/schema';
import { notFound } from '$lib/server/cqrs/errors';
import { lockFolio } from '$lib/server/domain/folio';

/** Locks the owning folio, then returns the payment plus all its siblings (for refundable math). */
export async function loadPaymentForReversal(tx: Tx, propertyId: string, paymentId: string) {
	const [payment] = await tx.select().from(folioPayment).where(eq(folioPayment.id, paymentId));
	if (!payment) throw notFound('Payment');
	const f = await lockFolio(tx, propertyId, payment.folioId);
	const siblings = await tx.select().from(folioPayment).where(eq(folioPayment.folioId, f.id));
	return { payment, folio: f, siblings };
}
