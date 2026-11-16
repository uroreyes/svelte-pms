import { describe, expect, it } from 'vitest';
import { applyTaxes, sumTaxLines, type TaxRule } from './tax';

const rule = (p: Partial<TaxRule>): TaxRule => ({ id: null, name: 'T', kind: 'PERCENT', rateBp: 0, amountCents: 0, appliesTo: 'ALL', inclusive: false, ...p });
const vat = rule({ name: 'VAT', rateBp: 1200 });
const service = rule({ name: 'Service', rateBp: 1000, appliesTo: 'POS' });
const city = rule({ name: 'City tax', kind: 'PER_PERSON_NIGHT', amountCents: 250, appliesTo: 'ROOM' });
const room = { scope: 'ROOM' as const, units: 1, guests: 2 };

describe('tax engine', () => {
	it('stacks exclusive percentages on the net (no compounding) and per-person-night fixed taxes', () => {
		const t = applyTaxes([vat, service, city], 10_000, room);
		expect(t.taxes).toEqual([
			{ ruleId: null, name: 'VAT', amountCents: 1200 },
			{ ruleId: null, name: 'City tax', amountCents: 500 }
		]);
		expect(t).toMatchObject({ netCents: 10_000, taxCents: 1700, totalCents: 11_700 });
	});

	it('scopes rules: POS lines skip room-only and fixed taxes', () => {
		const t = applyTaxes([vat, service, city], 2000, { scope: 'POS', units: 2, guests: 1 });
		expect(t.taxes.map((x) => x.name)).toEqual(['VAT', 'Service']);
		expect(t.totalCents).toBe(2000 + 240 + 200);
	});

	it('back-calculates price-inclusive taxes so the total equals the sticker price', () => {
		const inclVat = rule({ name: 'VAT', rateBp: 1200, inclusive: true });
		const t = applyTaxes([inclVat], 11_200, room);
		expect(t).toMatchObject({ netCents: 10_000, taxCents: 1200, totalCents: 11_200 });
		const odd = applyTaxes([inclVat, rule({ name: 'Levy', rateBp: 300, inclusive: true })], 9_999, room);
		expect(odd.totalCents).toBe(9_999); // rounding absorbed, never a cent off
		expect(odd.netCents + odd.taxCents).toBe(9_999);
	});

	it('mirrors negative amounts (discounts / reversals)', () => {
		const pos = applyTaxes([vat], 1050, room);
		const neg = applyTaxes([vat], -1050, room);
		expect(neg.totalCents).toBe(-pos.totalCents);
		expect(neg.taxes[0]!.amountCents).toBe(-pos.taxes[0]!.amountCents);
	});

	it('scales fixed per-night taxes with units', () => {
		const perNight = rule({ name: 'Bed tax', kind: 'PER_NIGHT', amountCents: 300, appliesTo: 'ROOM' });
		expect(applyTaxes([perNight], 10_000, { scope: 'ROOM', units: 3, guests: 4 }).taxCents).toBe(900);
	});

	it('merges tax lines by name', () => {
		expect(sumTaxLines([{ ruleId: 'a', name: 'VAT', amountCents: 10 }, { ruleId: 'a', name: 'VAT', amountCents: -10 }, { ruleId: 'b', name: 'City', amountCents: 5 }])).toEqual([{ ruleId: 'b', name: 'City', amountCents: 5 }]);
	});
});
