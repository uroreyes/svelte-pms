/**
 * Inventory ledger — the concurrency-critical kernel shared by every slice that
 * books, cancels or edits availability.
 *
 * Invariants:
 *  - Rows are locked with SELECT … FOR UPDATE ordered by date (one room type per tx) → no deadlocks.
 *  - Missing rows are materialised (INSERT … ON CONFLICT DO NOTHING) before locking.
 */
import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { DayInventory } from '$lib/shared/domain/availability';
import { nightsOf, type IsoDate } from '$lib/shared/domain/dates';
import type { Executor, Tx } from '../db/client';
import { roomInventoryDaily, roomType, roomUnit } from '../db/schema';

export type InventoryRow = typeof roomInventoryDaily.$inferSelect;

export async function unitCounts(db: Executor, roomTypeIds: string[]): Promise<Map<string, number>> {
	if (roomTypeIds.length === 0) return new Map();
	const rows = await db
		.select({ roomTypeId: roomUnit.roomTypeId, n: sql<number>`count(*)::int` })
		.from(roomUnit)
		.where(inArray(roomUnit.roomTypeId, roomTypeIds))
		.groupBy(roomUnit.roomTypeId);
	return new Map(rows.map((r) => [r.roomTypeId, r.n]));
}

export function toDayInventory(row: Pick<InventoryRow, 'date' | 'availableCount' | 'soldCount' | 'rateOverrideCents' | 'minLos' | 'isClosed'>, baseRateCents: number): DayInventory {
	return {
		date: row.date,
		availableCount: row.availableCount,
		soldCount: row.soldCount,
		rateCents: row.rateOverrideCents ?? baseRateCents,
		minLos: row.minLos,
		isClosed: row.isClosed
	};
}

/** Lock (and lazily create) the daily rows for one room type. */
export async function lockInventory(tx: Tx, roomTypeId: string, dates: readonly IsoDate[]): Promise<InventoryRow[]> {
	if (dates.length === 0) return [];
	const units = (await unitCounts(tx, [roomTypeId])).get(roomTypeId) ?? 0;
	await tx
		.insert(roomInventoryDaily)
		.values(dates.map((date) => ({ roomTypeId, date, availableCount: units })))
		.onConflictDoNothing({ target: [roomInventoryDaily.roomTypeId, roomInventoryDaily.date] });
	return tx
		.select()
		.from(roomInventoryDaily)
		.where(and(eq(roomInventoryDaily.roomTypeId, roomTypeId), inArray(roomInventoryDaily.date, [...dates])))
		.orderBy(asc(roomInventoryDaily.date))
		.for('update');
}

export async function consumeInventory(tx: Tx, rows: readonly InventoryRow[]): Promise<void> {
	if (rows.length === 0) return;
	await tx
		.update(roomInventoryDaily)
		.set({ soldCount: sql`${roomInventoryDaily.soldCount} + 1`, updatedAt: new Date() })
		.where(inArray(roomInventoryDaily.id, rows.map((r) => r.id)));
}

export async function releaseInventory(tx: Tx, roomTypeId: string, dates: readonly IsoDate[]): Promise<void> {
	const rows = await lockInventory(tx, roomTypeId, dates);
	if (rows.length === 0) return;
	await tx
		.update(roomInventoryDaily)
		.set({ soldCount: sql`GREATEST(${roomInventoryDaily.soldCount} - 1, 0)`, updatedAt: new Date() })
		.where(inArray(roomInventoryDaily.id, rows.map((r) => r.id)));
}

/**
 * Non-locking read for queries: every room type × every date in [from, toExclusive),
 * with defaults (allotment = physical units, rate = base rate) for missing rows.
 */
export async function readInventory(db: Executor, propertyId: string, from: IsoDate, toExclusive: IsoDate, roomTypeIds?: string[]): Promise<Map<string, DayInventory[]>> {
	const types = await db
		.select({ id: roomType.id, baseRateCents: roomType.baseRateCents })
		.from(roomType)
		.where(roomTypeIds ? and(eq(roomType.propertyId, propertyId), inArray(roomType.id, roomTypeIds)) : eq(roomType.propertyId, propertyId));
	const ids = types.map((t) => t.id);
	if (ids.length === 0) return new Map();

	const [counts, rows] = await Promise.all([
		unitCounts(db, ids),
		db
			.select()
			.from(roomInventoryDaily)
			.where(and(inArray(roomInventoryDaily.roomTypeId, ids), gte(roomInventoryDaily.date, from), lt(roomInventoryDaily.date, toExclusive)))
	]);
	const byKey = new Map(rows.map((r) => [`${r.roomTypeId}|${r.date}`, r]));
	const dates = nightsOf(from, toExclusive);

	return new Map(
		types.map((t) => [
			t.id,
			dates.map((date) => {
				const row = byKey.get(`${t.id}|${date}`);
				return row
					? toDayInventory(row, t.baseRateCents)
					: { date, availableCount: counts.get(t.id) ?? 0, soldCount: 0, rateCents: t.baseRateCents, minLos: null, isClosed: false };
			})
		])
	);
}
