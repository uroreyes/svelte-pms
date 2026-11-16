import { asc, desc, eq } from 'drizzle-orm';
import { catalogItem, ratePlan, roomType, roomUnit, taxRule } from '$lib/server/db/schema';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import { loadProperty } from '$lib/server/domain/property';
import type { ChargeCategory } from '$lib/shared/domain/enums';
import type { GetSetup } from './contract';

export const getSetup: QueryHandler<typeof GetSetup> = async (_input, { db, actor }) => {
	const [p, types, units, catalog, plans, taxes] = await Promise.all([
		loadProperty(db, actor.propertyId),
		db.select().from(roomType).where(eq(roomType.propertyId, actor.propertyId)).orderBy(asc(roomType.name)),
		db.select().from(roomUnit).where(eq(roomUnit.propertyId, actor.propertyId)).orderBy(asc(roomUnit.roomNumber)),
		db.select().from(catalogItem).where(eq(catalogItem.propertyId, actor.propertyId)).orderBy(asc(catalogItem.category), asc(catalogItem.name)),
		db.select().from(ratePlan).where(eq(ratePlan.propertyId, actor.propertyId)).orderBy(desc(ratePlan.isDefault), asc(ratePlan.name)),
		db.select().from(taxRule).where(eq(taxRule.propertyId, actor.propertyId)).orderBy(asc(taxRule.sortOrder), asc(taxRule.createdAt))
	]);
	return {
		property: {
			id: p.id,
			slug: p.slug,
			name: p.name,
			address: p.address,
			currency: p.currency,
			timezone: p.timezone,
			roomPostingMode: p.roomPostingMode
		},
		roomTypes: types.map((t) => ({
			id: t.id,
			name: t.name,
			baseRateCents: t.baseRateCents,
			baseOccupancy: t.baseOccupancy,
			maxOccupancy: t.maxOccupancy,
			amenities: t.amenities,
			units: units
				.filter((u) => u.roomTypeId === t.id)
				.map((u) => ({ id: u.id, roomNumber: u.roomNumber, floor: u.floor, housekeepingStatus: u.housekeepingStatus })),
			ratePlans: plans
				.filter((rp) => rp.roomTypeId === t.id)
				.map(({ propertyId: _p, createdAt: _c, ...rp }) => rp)
		})),
		taxRules: taxes.map((r) => ({ id: r.id, name: r.name, kind: r.kind, rateBp: r.rateBp, amountCents: r.amountCents, appliesTo: r.appliesTo, inclusive: r.inclusive, sortOrder: r.sortOrder, active: r.active })),
		catalog: catalog.map((c) => ({
			id: c.id,
			category: c.category as ChargeCategory,
			name: c.name,
			unitPriceCents: c.unitPriceCents,
			taxable: c.taxable,
			active: c.active
		}))
	};
};
