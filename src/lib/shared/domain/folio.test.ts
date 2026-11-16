import { describe, expect, it } from 'vitest';
import { folioTotals, refundableCents, reversedItemIds, type LedgerPayment } from './folio';

describe('folio math', () => {
	it('Balance Due = Room + POS − Payments, with signed reversals', () => {
		const items = [{ totalCents: 11200 }, { totalCents: 2352 }, { totalCents: -2352 }];
		const payments = [{ amountCents: 5000 }, { amountCents: -1000 }];
		expect(folioTotals(items, payments)).toEqual({ totalChargesCents: 11200, totalPaymentsCents: 4000, balanceCents: 7200 });
	});

	it('identifies reversed items', () => {
		expect(reversedItemIds([{ reversesItemId: null }, { reversesItemId: 'a' }])).toEqual(new Set(['a']));
	});

	it('limits refunds to the unrefunded remainder and blocks after a void', () => {
		const pay: LedgerPayment = { id: 'p1', kind: 'PAYMENT', amountCents: 10000, relatedPaymentId: null };
		const refund: LedgerPayment = { id: 'r1', kind: 'REFUND', amountCents: -3000, relatedPaymentId: 'p1' };
		expect(refundableCents(pay, [pay])).toBe(10000);
		expect(refundableCents(pay, [pay, refund])).toBe(7000);
		expect(refundableCents(pay, [pay, { id: 'v', kind: 'VOID', amountCents: -10000, relatedPaymentId: 'p1' }])).toBe(0);
		expect(refundableCents(refund, [pay, refund])).toBe(0);
	});
});
