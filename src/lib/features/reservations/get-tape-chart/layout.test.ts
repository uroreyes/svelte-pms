import { describe, expect, it } from 'vitest';
import { packLanes, placeBar } from './layout';

describe('tape chart layout', () => {
	it('clips bars to the visible window', () => {
		expect(placeBar('2026-12-01', 14, { checkIn: '2026-12-03', checkOut: '2026-12-05' })).toEqual({ startCol: 2, span: 2, continuesBefore: false, continuesAfter: false });
		expect(placeBar('2026-12-01', 14, { checkIn: '2026-11-28', checkOut: '2026-12-02' })).toEqual({ startCol: 0, span: 1, continuesBefore: true, continuesAfter: false });
		expect(placeBar('2026-12-01', 7, { checkIn: '2026-12-06', checkOut: '2026-12-20' })).toEqual({ startCol: 5, span: 2, continuesBefore: false, continuesAfter: true });
	});

	it('packs unallocated stays into the minimum lanes (back-to-back share a lane)', () => {
		const lanes = packLanes([
			{ checkIn: '2026-12-01', checkOut: '2026-12-03' },
			{ checkIn: '2026-12-03', checkOut: '2026-12-05' },
			{ checkIn: '2026-12-02', checkOut: '2026-12-04' }
		]);
		expect(lanes).toHaveLength(2);
		expect(lanes[0]).toHaveLength(2);
	});
});
