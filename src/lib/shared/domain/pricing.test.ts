import { describe, expect, it } from 'vitest';
import { evaluatePlan, extraGuests, planNightPrice, type PlanTerms } from './pricing';

const plan = (p: Partial<PlanTerms> = {}): PlanTerms => ({
	id: 'p',
	name: 'Flex',
	adjustmentKind: 'NONE',
	adjustmentValue: 0,
	includedOccupancy: 2,
	extraAdultCents: 2500,
	extraChildCents: 1000,
	minLos: null,
	...p
});

describe('rate plan pricing', () => {
	it('derives from the day rate by percent or fixed amount', () => {
		expect(planNightPrice(10_000, plan({ adjustmentKind: 'PERCENT', adjustmentValue: -1500 }), undefined, { adults: 2, children: 0 })).toBe(8500);
		expect(planNightPrice(10_000, plan({ adjustmentKind: 'FIXED', adjustmentValue: 1800 }), undefined, { adults: 1, children: 0 })).toBe(11_800);
		expect(planNightPrice(1000, plan({ adjustmentKind: 'FIXED', adjustmentValue: -5000 }), undefined, { adults: 1, children: 0 })).toBe(0);
	});

	it('a per-date plan override replaces the derived base', () => {
		expect(planNightPrice(10_000, plan({ adjustmentKind: 'PERCENT', adjustmentValue: -1500 }), { rateOverrideCents: 7000, isClosed: false }, { adults: 2, children: 0 })).toBe(7000);
	});

	it('charges extra guests above included occupancy (adults fill it first)', () => {
		expect(extraGuests(2, { adults: 3, children: 1 })).toEqual({ adults: 1, children: 1 });
		expect(extraGuests(2, { adults: 1, children: 2 })).toEqual({ adults: 0, children: 1 });
		expect(planNightPrice(10_000, plan(), undefined, { adults: 3, children: 1 })).toBe(10_000 + 2500 + 1000);
	});

	it('enforces plan stop-sell and minimum stay', () => {
		const days = new Map([['2026-12-05', { rateOverrideCents: null, isClosed: true }]]);
		expect(evaluatePlan(plan(), days, ['2026-12-04', '2026-12-05'])).toMatchObject({ ok: false, reason: 'PLAN_CLOSED' });
		expect(evaluatePlan(plan({ minLos: 3 }), new Map(), ['2026-12-04', '2026-12-05'])).toMatchObject({ ok: false, reason: 'PLAN_MIN_LOS' });
		expect(evaluatePlan(plan(), new Map(), ['2026-12-04'])).toEqual({ ok: true });
	});
});
