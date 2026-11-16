import { asc, eq } from 'drizzle-orm';
import { evaluateStay } from '$lib/shared/domain/availability';
import { nightsOf } from '$lib/shared/domain/dates';
import { formatMoney, quoteStay } from '$lib/shared/domain/money';
import { evaluatePlan, priceNights } from '$lib/shared/domain/pricing';
import { describeRule } from '$lib/shared/domain/tax';
import { roomType } from '$lib/server/db/schema';
import type { PublicQueryHandler } from '$lib/server/cqrs/execute';
import { invalid } from '$lib/server/cqrs/errors';
import { readInventory } from '$lib/server/domain/inventory';
import { businessDate, loadPropertyBySlug } from '$lib/server/domain/property';
import { loadPlanDays, NO_DAYS, plansForTypes } from '$lib/server/domain/rate-plans';
import { validateStay } from '$lib/server/domain/reservations';
import { loadTaxRules } from '$lib/server/domain/taxes';
import type { AvailabilityOffer, SearchAvailability } from './contract';

export const searchAvailability: PublicQueryHandler<typeof SearchAvailability> = async (input, { db, now }) => {
	const p = await loadPropertyBySlug(db, input.property);
	if (input.checkIn < businessDate(p, now)) throw invalid('Check-in cannot be in the past');
	const nights = validateStay(input.checkIn, input.checkOut);
	const types = await db.select().from(roomType).where(eq(roomType.propertyId, p.id)).orderBy(asc(roomType.baseRateCents));
	const [inventory, plans, taxRules] = await Promise.all([readInventory(db, p.id, input.checkIn, input.checkOut), plansForTypes(db, p.id, types), loadTaxRules(db, p)]);
	const planDays = await loadPlanDays(db, [...plans.values()].flat().map((x) => x.id), input.checkIn, input.checkOut);
	const party = { adults: input.adults, children: input.children };
	const guests = input.adults + input.children;
	const money = (c: number) => formatMoney(c, p.currency);

	const offers: AvailabilityOffer[] = types.flatMap((t) => {
		const days = inventory.get(t.id) ?? [];
		const verdict = evaluateStay(days, nights);
		const fits = guests <= t.maxOccupancy;
		return (plans.get(t.id) ?? []).map((plan) => {
			const pd = planDays.get(plan.id ?? '') ?? NO_DAYS;
			const pv = evaluatePlan(plan, pd, nights);
			const bookable = fits && verdict.bookable && pv.ok;
			const reason = !fits ? 'OCCUPANCY' : !verdict.bookable ? verdict.reason : !pv.ok ? pv.reason : null;
			const message = !fits ? `Sleeps up to ${t.maxOccupancy}` : !verdict.bookable ? verdict.message : !pv.ok ? pv.message : null;
			return {
				key: `${t.id}:${plan.id ?? 'std'}`,
				roomTypeId: t.id,
				ratePlanId: plan.id,
				name: t.name,
				plan: { name: plan.name, description: plan.description, refundable: plan.refundable, freeCancellationDays: plan.freeCancellationDays, breakfastIncluded: plan.breakfastIncluded },
				maxOccupancy: t.maxOccupancy,
				amenities: t.amenities,
				bookable,
				unavailableReason: reason,
				message,
				fewLeft: verdict.bookable && verdict.remaining <= 3 ? verdict.remaining : null,
				maxRooms: verdict.bookable ? Math.min(5, verdict.remaining) : 0,
				quote: quoteStay(priceNights(days, plan, pd, party), taxRules, guests)
			};
		});
	});

	return {
		property: { name: p.name, currency: p.currency, taxNotes: taxRules.map((r) => `${r.name} ${describeRule(r, money)}`) },
		checkIn: input.checkIn,
		checkOut: input.checkOut,
		nights: nightsOf(input.checkIn, input.checkOut).length,
		party,
		offers
	};
};
