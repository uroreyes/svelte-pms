import { describe, expect, it } from 'vitest';
import { kpis } from './kpi';

describe('hospitality KPIs', () => {
	it('computes Occupancy, ADR and RevPAR = ADR × Occupancy', () => {
		// 10 rooms × 30 nights = 300 available; 210 sold; $25,200 revenue
		const k = kpis(210, 300, 2_520_000);
		expect(k.occupancyPct).toBe(70);
		expect(k.adrCents).toBe(12_000);
		expect(k.revparCents).toBe(8_400);
		expect(k.revparCents).toBe(Math.round(k.adrCents * 0.7));
	});

	it('is safe with zero denominators', () => {
		expect(kpis(0, 0, 0)).toEqual({ occupancyPct: 0, adrCents: 0, revparCents: 0 });
	});
});
