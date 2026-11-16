/**
 * Rate-plan pricing (pure). A plan derives its nightly price from the room type's day rate,
 * may override it per date, adds extra-guest charges above the included occupancy, and can
 * carry its own stop-sell / minimum stay on top of the room type's inventory restrictions.
 */
import type { RateAdjustment } from './enums';

export interface PlanTerms {
	id: string | null;
	name: string;
	adjustmentKind: RateAdjustment;
	/** PERCENT: basis points (−1000 = 10% off). FIXED: cents per night (may be negative). */
	adjustmentValue: number;
	includedOccupancy: number;
	extraAdultCents: number;
	extraChildCents: number;
	minLos: number | null;
}

export interface PlanDay {
	rateOverrideCents: number | null;
	isClosed: boolean;
}

export interface Party {
	adults: number;
	children: number;
}

/** Included occupancy covers adults first, then children. */
export function extraGuests(included: number, party: Party): Party {
	const adults = Math.max(0, party.adults - included);
	const leftover = Math.max(0, included - party.adults);
	return { adults, children: Math.max(0, party.children - leftover) };
}

export function planNightPrice(dayRateCents: number, plan: PlanTerms, day: PlanDay | undefined, party: Party): number {
	let base = day?.rateOverrideCents ?? dayRateCents;
	if (day?.rateOverrideCents == null) {
		if (plan.adjustmentKind === 'PERCENT') base = dayRateCents + Math.round((dayRateCents * plan.adjustmentValue) / 10_000);
		if (plan.adjustmentKind === 'FIXED') base = dayRateCents + plan.adjustmentValue;
	}
	const extra = extraGuests(plan.includedOccupancy, party);
	return Math.max(0, base) + extra.adults * plan.extraAdultCents + extra.children * plan.extraChildCents;
}

export type PlanVerdict = { ok: true } | { ok: false; reason: 'PLAN_CLOSED' | 'PLAN_MIN_LOS'; message: string };

export function evaluatePlan(plan: PlanTerms, days: ReadonlyMap<string, PlanDay>, nights: readonly string[]): PlanVerdict {
	if (plan.minLos && nights.length < plan.minLos) return { ok: false, reason: 'PLAN_MIN_LOS', message: `${plan.name} requires at least ${plan.minLos} nights` };
	const closed = nights.find((n) => days.get(n)?.isClosed);
	if (closed) return { ok: false, reason: 'PLAN_CLOSED', message: `${plan.name} is not sold on ${closed}` };
	return { ok: true };
}

export function priceNights(dayRates: readonly { date: string; rateCents: number }[], plan: PlanTerms, days: ReadonlyMap<string, PlanDay>, party: Party) {
	return dayRates.map((d) => ({ date: d.date, rateCents: planNightPrice(d.rateCents, plan, days.get(d.date), party) }));
}
