import { loadPlanDays, NO_DAYS, resolvePlan } from '$lib/server/domain/rate-plans';
import { and, asc, eq, sql } from 'drizzle-orm';
import { channelMapping, channelOutbox } from '$lib/server/db/schema';
import type { NonTxCommandHandler } from '$lib/server/cqrs/execute';
import { readInventory } from '$lib/server/domain/inventory';
import { buildAri, pushAri } from './ari.server';
import type { ProcessOutbox } from './contract';

const MAX_ATTEMPTS = 5;

/**
 * Delivers pending ARI pushes. Each message is claimed with FOR UPDATE SKIP LOCKED in its own
 * short transaction, so several workers can run concurrently without double-sending.
 */
export function makeProcessOutbox(secret: () => string): NonTxCommandHandler<typeof ProcessOutbox> {
	return async ({ limit }, { db, actor }) => {
		const tally = { sent: 0, failed: 0, dryRun: 0 };
		for (let i = 0; i < limit; i++) {
			const done = await db.transaction(async (tx) => {
				const [job] = await tx
					.select({ o: channelOutbox, m: channelMapping })
					.from(channelOutbox)
					.innerJoin(channelMapping, eq(channelMapping.id, channelOutbox.channelMappingId))
					.where(and(eq(channelOutbox.propertyId, actor.propertyId), eq(channelOutbox.status, 'PENDING')))
					.orderBy(asc(channelOutbox.createdAt))
					.limit(1)
					.for('update', { of: channelOutbox, skipLocked: true });
				if (!job) return true;

				const inventory = await readInventory(tx, actor.propertyId, job.o.fromDate, job.o.toDate, [job.m.roomTypeId]);
				const plan = await resolvePlan(tx, actor.propertyId, job.m.roomTypeId, job.m.ratePlanId);
				const planDays = (await loadPlanDays(tx, [plan.id], job.o.fromDate, job.o.toDate)).get(plan.id ?? '') ?? NO_DAYS;
				const message = buildAri(job.m.channelName, job.m.externalRoomId, job.m.externalRateId, inventory.get(job.m.roomTypeId) ?? [], plan, planDays);
				try {
					if (job.m.pushUrl) {
						await pushAri(job.m.pushUrl, message, secret());
						tally.sent++;
					} else {
						tally.dryRun++;
					}
					await tx
						.update(channelOutbox)
						.set({ status: 'SENT', attempts: sql`${channelOutbox.attempts} + 1`, processedAt: new Date(), lastError: job.m.pushUrl ? null : 'dry-run: no push URL configured' })
						.where(eq(channelOutbox.id, job.o.id));
				} catch (e) {
					const attempts = job.o.attempts + 1;
					tally.failed++;
					await tx
						.update(channelOutbox)
						.set({ status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING', attempts, lastError: e instanceof Error ? e.message.slice(0, 500) : 'push failed' })
						.where(eq(channelOutbox.id, job.o.id));
					if (attempts < MAX_ATTEMPTS) return true; // leave for the next run; don't spin on it now
				}
				return false;
			});
			if (done) break;
		}
		return tally;
	};
}
