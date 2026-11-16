/**
 * Calendar-date helpers. All dates are ISO `YYYY-MM-DD` strings, interpreted as
 * timezone-free calendar days (math is done in UTC to avoid DST drift).
 * Stays are half-open: [checkIn, checkOut).
 */
export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
	if (!ISO_DATE.test(value)) return false;
	const d = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUtc(date: IsoDate): number {
	if (!isIsoDate(date)) throw new RangeError(`Invalid ISO date: ${date}`);
	return Date.parse(`${date}T00:00:00Z`);
}

function fromUtc(ms: number): IsoDate {
	return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
	return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function diffDays(from: IsoDate, to: IsoDate): number {
	return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: IsoDate): number {
	return new Date(toUtc(date)).getUTCDay();
}

/** Nights consumed by a stay: half-open [checkIn, checkOut). */
export function nightsOf(checkIn: IsoDate, checkOut: IsoDate): IsoDate[] {
	const n = diffDays(checkIn, checkOut);
	if (n <= 0) return [];
	return Array.from({ length: n }, (_, i) => addDays(checkIn, i));
}

/** Inclusive date range, optionally filtered to days of week (0=Sun…6=Sat). */
export function expandRange(from: IsoDate, toInclusive: IsoDate, daysOfWeek?: readonly number[]): IsoDate[] {
	const n = diffDays(from, toInclusive);
	if (n < 0) return [];
	const filter = daysOfWeek && daysOfWeek.length > 0 ? new Set(daysOfWeek) : null;
	const out: IsoDate[] = [];
	for (let i = 0; i <= n; i++) {
		const d = addDays(from, i);
		if (!filter || filter.has(dayOfWeek(d))) out.push(d);
	}
	return out;
}

/** `YYYY-MM` → first and last calendar day (inclusive). */
export function monthBounds(month: string): { from: IsoDate; to: IsoDate } {
	if (!/^\d{4}-\d{2}$/.test(month)) throw new RangeError(`Invalid month: ${month}`);
	const from = `${month}-01`;
	const [y, m] = month.split('-').map(Number) as [number, number];
	const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
	return { from, to: `${month}-${String(last).padStart(2, '0')}` };
}

/** Half-open interval overlap: [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅ */
export function overlaps(aStart: IsoDate, aEnd: IsoDate, bStart: IsoDate, bEnd: IsoDate): boolean {
	return aStart < bEnd && bStart < aEnd;
}

/** Today's calendar date in an IANA timezone (property business date). */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
}

export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function formatDate(date: IsoDate, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
	return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(new Date(toUtc(date)));
}

/** Format an instant in the hotel's timezone (never the server's or browser's). */
export function formatDateTime(iso: string | Date, timeZone: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }): string {
	return new Intl.DateTimeFormat('en-US', { ...opts, timeZone }).format(typeof iso === 'string' ? new Date(iso) : iso);
}

/** Calendar date of an instant in the hotel's timezone. */
export function dateIn(iso: string | Date, timeZone: string): IsoDate {
	return todayIn(timeZone, typeof iso === 'string' ? new Date(iso) : iso);
}
