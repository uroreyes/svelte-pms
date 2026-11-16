/** Outbound ARI (Availability, Rates, Inventory) adapter: signed JSON push. */
import { signBody } from '$lib/server/security/hmac';
import { safeFetchText } from '$lib/server/security/safe-url';
import type { DayInventory } from '$lib/shared/domain/availability';
import { remainingOf } from '$lib/shared/domain/availability';
import { planNightPrice, type PlanDay, type PlanTerms } from '$lib/shared/domain/pricing';

export interface AriMessage {
	channel: string;
	externalRoomId: string;
	externalRateId: string | null;
	days: { date: string; available: number; rateCents: number; minLos: number | null; closed: boolean }[];
}

/** Prices are the plan's rate at its included occupancy (OTAs apply their own extra-guest rules). */
export function buildAri(channel: string, externalRoomId: string, externalRateId: string | null, days: DayInventory[], plan: PlanTerms, planDays: ReadonlyMap<string, PlanDay>): AriMessage {
	const party = { adults: plan.includedOccupancy, children: 0 };
	return {
		channel,
		externalRoomId,
		externalRateId,
		days: days.map((d) => {
			const closed = d.isClosed || !!planDays.get(d.date)?.isClosed;
			const minLos = Math.max(d.minLos ?? 0, plan.minLos ?? 0) || null;
			return { date: d.date, available: closed ? 0 : remainingOf(d), rateCents: planNightPrice(d.rateCents, plan, planDays.get(d.date), party), minLos, closed };
		})
	};
}

export async function pushAri(url: string, message: AriMessage, secret: string): Promise<void> {
	const body = JSON.stringify(message);
	await safeFetchText(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-pms-signature': signBody(body, secret) },
		body
	});
}
