import { and, eq, sql } from 'drizzle-orm';
import { addDays, expandRange } from '$lib/shared/domain/dates';
import { ratePlan, ratePlanDaily } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { notFound } from '$lib/server/cqrs/errors';
import { enqueueAri } from '$lib/server/domain/outbox';
import type { BulkUpdateRatePlan } from './contract';

/** Per-plan rate override / stop-sell for a range (optionally by weekday). */
export const bulkUpdateRatePlan: CommandHandler<typeof BulkUpdateRatePlan> = async (input, { db, actor }) => {
	const [plan] = await db
		.select()
		.from(ratePlan)
		.where(and(eq(ratePlan.id, input.ratePlanId), eq(ratePlan.propertyId, actor.propertyId)));
	if (!plan) throw notFound('Rate plan');
	const dates = expandRange(input.from, input.to, input.daysOfWeek);
	if (dates.length === 0) return { updated: 0 };

	const set: Partial<typeof ratePlanDaily.$inferInsert> = {};
	if (input.rateOverrideCents !== undefined) set.rateOverrideCents = input.rateOverrideCents;
	if (input.isClosed !== undefined) set.isClosed = input.isClosed;
	await db
		.insert(ratePlanDaily)
		.values(dates.map((date) => ({ ratePlanId: plan.id, date, rateOverrideCents: null, isClosed: false, ...set })))
		.onConflictDoUpdate({
			target: [ratePlanDaily.ratePlanId, ratePlanDaily.date],
			set: {
				rateOverrideCents: input.rateOverrideCents !== undefined ? sql`excluded.rate_override_cents` : sql`${ratePlanDaily.rateOverrideCents}`,
				isClosed: input.isClosed !== undefined ? sql`excluded.is_closed` : sql`${ratePlanDaily.isClosed}`
			}
		});
	await enqueueAri(db, actor.propertyId, plan.roomTypeId, dates[0]!, addDays(dates[dates.length - 1]!, 1));
	return { updated: dates.length };
};
