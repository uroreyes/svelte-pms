import { describe, expect, it } from 'vitest';
import { evaluateStay, type DayInventory } from './availability';

const day = (date: string, p: Partial<DayInventory> = {}): DayInventory => ({
	date,
	availableCount: 5,
	soldCount: 0,
	rateCents: 10000,
	minLos: null,
	isClosed: false,
	...p
});

describe('evaluateStay', () => {
	const nights = ['2026-12-04', '2026-12-05'];

	it('is bookable and reports the tightest remaining count', () => {
		const v = evaluateStay([day('2026-12-04', { soldCount: 4 }), day('2026-12-05', { soldCount: 2 })], nights);
		expect(v).toEqual({ bookable: true, remaining: 1 });
	});

	it('rejects sold-out, closed, and missing nights', () => {
		expect(evaluateStay([day('2026-12-04'), day('2026-12-05', { soldCount: 5 })], nights)).toMatchObject({ bookable: false, reason: 'SOLD_OUT', date: '2026-12-05' });
		expect(evaluateStay([day('2026-12-04', { isClosed: true }), day('2026-12-05')], nights)).toMatchObject({ bookable: false, reason: 'CLOSED' });
		expect(evaluateStay([day('2026-12-04')], nights)).toMatchObject({ bookable: false, reason: 'NO_INVENTORY' });
	});

	it('applies MinLOS on the arrival date only', () => {
		expect(evaluateStay([day('2026-12-04', { minLos: 3 }), day('2026-12-05')], nights)).toMatchObject({ bookable: false, reason: 'MIN_LOS' });
		expect(evaluateStay([day('2026-12-04'), day('2026-12-05', { minLos: 3 })], nights)).toMatchObject({ bookable: true });
	});

	it('treats overbooked days (sold > available) as sold out', () => {
		expect(evaluateStay([day('2026-12-04', { availableCount: 1, soldCount: 2 }), day('2026-12-05')], nights)).toMatchObject({ reason: 'SOLD_OUT' });
	});
});
