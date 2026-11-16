import { asc, eq } from 'drizzle-orm';
import { addDays, dayOfWeek, expandRange, monthBounds } from '$lib/shared/domain/dates';
import { remainingOf } from '$lib/shared/domain/availability';
import { roomType } from '$lib/server/db/schema';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import { readInventory, unitCounts } from '$lib/server/domain/inventory';
import { loadProperty } from '$lib/server/domain/property';
import { plansForTypes } from '$lib/server/domain/rate-plans';
import type { GetInventoryGrid } from './contract';

export const getInventoryGrid: QueryHandler<typeof GetInventoryGrid> = async ({ month }, { db, actor }) => {
	const { from, to } = monthBounds(month);
	const [p, types] = await Promise.all([
		loadProperty(db, actor.propertyId),
		db.select().from(roomType).where(eq(roomType.propertyId, actor.propertyId)).orderBy(asc(roomType.name))
	]);
	const [inventory, counts] = await Promise.all([readInventory(db, actor.propertyId, from, addDays(to, 1)), unitCounts(db, types.map((t) => t.id))]);
	const plans = await plansForTypes(db, actor.propertyId, types);
	return {
		month,
		currency: p.currency,
		dates: expandRange(from, to).map((date) => ({ date, dow: dayOfWeek(date) })),
		roomTypes: types.map((t) => ({
			id: t.id,
			name: t.name,
			baseRateCents: t.baseRateCents,
			units: counts.get(t.id) ?? 0,
			plans: (plans.get(t.id) ?? []).flatMap((pl) => (pl.id ? [{ id: pl.id, name: pl.name }] : [])),
			cells: (inventory.get(t.id) ?? []).map((d) => ({
				...d,
				remaining: remainingOf(d),
				isOverride: d.rateCents !== t.baseRateCents
			}))
		}))
	};
};
