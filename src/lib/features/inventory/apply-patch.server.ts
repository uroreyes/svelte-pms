import { and, eq, inArray } from 'drizzle-orm';
import { addDays, type IsoDate } from '$lib/shared/domain/dates';
import type { Tx } from '$lib/server/db/client';
import { roomInventoryDaily, roomType } from '$lib/server/db/schema';
import { conflict, notFound } from '$lib/server/cqrs/errors';
import { lockInventory } from '$lib/server/domain/inventory';
import { enqueueAri } from '$lib/server/domain/outbox';
import type { InventoryPatch } from './patch';

/** Locks the affected rows, enforces sold ≤ available, applies the patch and enqueues ARI. */
export async function applyInventoryPatch(tx: Tx, propertyId: string, roomTypeId: string, dates: IsoDate[], patch: InventoryPatch, now: Date): Promise<number> {
	const [type] = await tx
		.select({ id: roomType.id })
		.from(roomType)
		.where(and(eq(roomType.id, roomTypeId), eq(roomType.propertyId, propertyId)));
	if (!type) throw notFound('Room type');
	if (dates.length === 0) return 0;

	const rows = await lockInventory(tx, roomTypeId, dates);
	if (patch.availableCount !== undefined) {
		const below = rows.filter((r) => r.soldCount > patch.availableCount!);
		if (below.length > 0) {
			throw conflict(`Availability cannot be set below rooms already sold (${below.length} date(s))`, {
				dates: below.map((r) => ({ date: r.date, sold: r.soldCount }))
			});
		}
	}
	const set: Partial<typeof roomInventoryDaily.$inferInsert> = { updatedAt: now };
	if (patch.availableCount !== undefined) set.availableCount = patch.availableCount;
	if (patch.rateOverrideCents !== undefined) set.rateOverrideCents = patch.rateOverrideCents;
	if (patch.minLos !== undefined) set.minLos = patch.minLos;
	if (patch.isClosed !== undefined) set.isClosed = patch.isClosed;

	await tx.update(roomInventoryDaily).set(set).where(inArray(roomInventoryDaily.id, rows.map((r) => r.id)));
	await enqueueAri(tx, propertyId, roomTypeId, dates[0]!, addDays(dates[dates.length - 1]!, 1));
	return rows.length;
}
