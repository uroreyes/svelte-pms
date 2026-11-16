import { describe, expect, it } from 'vitest';
import { parseMoney, priceLine, quoteStay, taxOf } from './money';
import { legacyRules } from './tax';

describe('money', () => {
	it('computes tax in basis points with symmetric rounding', () => {
		expect(taxOf(10_000, 1200)).toBe(1200);
		expect(taxOf(1050, 1250)).toBe(131); // 131.25
		expect(taxOf(-1050, 1250)).toBe(-131); // reversal mirrors original
		expect(taxOf(5, 1000)).toBe(1); // 0.5 rounds away from zero
	});

	it('quotes a stay with a per-night breakdown', () => {
		const q = quoteStay(
			[
				{ date: '2026-12-04', rateCents: 15000 },
				{ date: '2026-12-05', rateCents: 15000 },
				{ date: '2026-12-06', rateCents: 9900 }
			],
			legacyRules(1200),
			2
		);
		expect(q.subtotalCents).toBe(39900);
		expect(q.taxCents).toBe(1800 + 1800 + 1188);
		expect(q.totalCents).toBe(39900 + 4788);
	});

	it('prices folio lines (qty × unit + tax)', () => {
		expect(priceLine(3, 700, legacyRules(1200))).toMatchObject({ amountCents: 2100, taxCents: 252, totalCents: 2352 });
		expect(priceLine(1, -1000, legacyRules(1200))).toMatchObject({ amountCents: -1000, taxCents: -120, totalCents: -1120 });
		expect(priceLine(2, 500, [])).toMatchObject({ amountCents: 1000, taxCents: 0, totalCents: 1000, taxes: [] });
	});

	it('parses user money input', () => {
		expect(parseMoney('12.5')).toBe(1250);
		expect(parseMoney(' 99 ')).toBe(9900);
		expect(parseMoney('1.234')).toBeNull();
		expect(parseMoney('abc')).toBeNull();
	});
});
