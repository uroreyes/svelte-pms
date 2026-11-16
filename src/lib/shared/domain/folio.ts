import type { Cents } from './money';

export interface LedgerItem {
	id: string;
	totalCents: Cents;
	reversesItemId: string | null;
}

export interface LedgerPayment {
	id: string;
	kind: 'PAYMENT' | 'REFUND' | 'VOID';
	amountCents: Cents;
	relatedPaymentId: string | null;
}

export interface FolioTotals {
	totalChargesCents: Cents;
	totalPaymentsCents: Cents;
	balanceCents: Cents;
}

/** Balance Due = Charges − Payments. Reversal rows are signed, so plain sums are correct. */
export function folioTotals(items: readonly Pick<LedgerItem, 'totalCents'>[], payments: readonly Pick<LedgerPayment, 'amountCents'>[]): FolioTotals {
	const totalChargesCents = items.reduce((s, i) => s + i.totalCents, 0);
	const totalPaymentsCents = payments.reduce((s, p) => s + p.amountCents, 0);
	return { totalChargesCents, totalPaymentsCents, balanceCents: totalChargesCents - totalPaymentsCents };
}

/** IDs of items that have been reversed (voided / transferred out). */
export function reversedItemIds(items: readonly Pick<LedgerItem, 'reversesItemId'>[]): Set<string> {
	return new Set(items.flatMap((i) => (i.reversesItemId ? [i.reversesItemId] : [])));
}

/** How much of an original payment can still be refunded. */
export function refundableCents(payment: LedgerPayment, all: readonly LedgerPayment[]): Cents {
	if (payment.kind !== 'PAYMENT') return 0;
	const related = all.filter((p) => p.relatedPaymentId === payment.id);
	if (related.some((p) => p.kind === 'VOID')) return 0;
	const refunded = related.filter((p) => p.kind === 'REFUND').reduce((s, p) => s - p.amountCents, 0);
	return Math.max(0, payment.amountCents - refunded);
}
