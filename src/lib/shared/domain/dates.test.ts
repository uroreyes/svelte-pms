import { describe, expect, it } from 'vitest';
import { addDays, dateIn, dayOfWeek, formatDateTime, diffDays, expandRange, isIsoDate, monthBounds, nightsOf, overlaps, todayIn } from './dates';

describe('dates', () => {
	it('validates ISO dates strictly', () => {
		expect(isIsoDate('2026-02-28')).toBe(true);
		expect(isIsoDate('2026-02-30')).toBe(false);
		expect(isIsoDate('2026-2-3')).toBe(false);
	});

	it('uses half-open stays: May 10 → May 12 consumes the 10th and 11th only', () => {
		expect(nightsOf('2026-05-10', '2026-05-12')).toEqual(['2026-05-10', '2026-05-11']);
		expect(nightsOf('2026-05-10', '2026-05-10')).toEqual([]);
		expect(nightsOf('2026-05-12', '2026-05-10')).toEqual([]);
	});

	it('handles month/year and DST boundaries without drift', () => {
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
		expect(diffDays('2026-03-07', '2026-03-09')).toBe(2); // US DST weekend
		expect(nightsOf('2026-10-24', '2026-10-27')).toHaveLength(3); // EU DST weekend
	});

	it('expands ranges with day-of-week filters (Fri+Sat in December)', () => {
		const fs = expandRange('2026-12-01', '2026-12-31', [5, 6]);
		expect(fs).toHaveLength(8);
		expect(fs.every((d) => [5, 6].includes(dayOfWeek(d)))).toBe(true);
		expect(expandRange('2026-12-01', '2026-12-31')).toHaveLength(31);
		expect(expandRange('2026-12-05', '2026-12-01')).toEqual([]);
	});

	it('computes month bounds incl. leap years', () => {
		expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
		expect(monthBounds('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
	});

	it('treats back-to-back stays as non-overlapping', () => {
		expect(overlaps('2026-05-10', '2026-05-12', '2026-05-12', '2026-05-14')).toBe(false);
		expect(overlaps('2026-05-10', '2026-05-12', '2026-05-11', '2026-05-14')).toBe(true);
	});

	it('derives the business date in the property timezone', () => {
		const instant = new Date('2026-11-15T20:00:00Z');
		expect(todayIn('UTC', instant)).toBe('2026-11-15');
		expect(todayIn('Asia/Manila', instant)).toBe('2026-11-16');
		expect(todayIn('America/Los_Angeles', instant)).toBe('2026-11-15');
	});

	it('formats instants in the hotel timezone, not the server one', () => {
		const at = '2026-11-14T13:41:00Z';
		expect(formatDateTime(at, 'Asia/Manila', { hour: '2-digit', minute: '2-digit', hour12: false })).toBe('21:41');
		expect(dateIn(at, 'Asia/Manila')).toBe('2026-11-14');
		expect(dateIn('2026-11-14T17:00:00Z', 'Asia/Manila')).toBe('2026-11-15');
	});
});
