import type { IsoDate } from './dates';

/** One room type on one date, with defaults already applied. */
export interface DayInventory {
	date: IsoDate;
	availableCount: number;
	soldCount: number;
	rateCents: number;
	minLos: number | null;
	isClosed: boolean;
}

export type UnavailableReason = 'NO_INVENTORY' | 'CLOSED' | 'SOLD_OUT' | 'MIN_LOS';

export type StayVerdict =
	| { bookable: true; remaining: number }
	| { bookable: false; reason: UnavailableReason; date: IsoDate | null; message: string };

export function remainingOf(day: Pick<DayInventory, 'availableCount' | 'soldCount'>): number {
	return Math.max(0, day.availableCount - day.soldCount);
}

/**
 * Pure availability rule shared by the search query and every booking command.
 * MinLOS is evaluated on the arrival date (industry-standard "MinLOS on arrival").
 */
export function evaluateStay(days: readonly DayInventory[], nights: readonly IsoDate[]): StayVerdict {
	if (nights.length === 0) {
		return { bookable: false, reason: 'NO_INVENTORY', date: null, message: 'Stay must be at least one night' };
	}
	const byDate = new Map(days.map((d) => [d.date, d]));
	let remaining = Number.POSITIVE_INFINITY;

	const arrival = byDate.get(nights[0]!);
	if (arrival?.minLos && nights.length < arrival.minLos) {
		return {
			bookable: false,
			reason: 'MIN_LOS',
			date: arrival.date,
			message: `Minimum stay of ${arrival.minLos} nights for arrival on ${arrival.date}`
		};
	}

	for (const night of nights) {
		const day = byDate.get(night);
		if (!day) return { bookable: false, reason: 'NO_INVENTORY', date: night, message: `No inventory for ${night}` };
		if (day.isClosed) return { bookable: false, reason: 'CLOSED', date: night, message: `Closed for sale on ${night}` };
		const left = remainingOf(day);
		if (left <= 0) return { bookable: false, reason: 'SOLD_OUT', date: night, message: `Sold out on ${night}` };
		remaining = Math.min(remaining, left);
	}
	return { bookable: true, remaining };
}
