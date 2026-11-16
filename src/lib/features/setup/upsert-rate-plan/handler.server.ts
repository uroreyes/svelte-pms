import { and, eq, ne } from 'drizzle-orm';
import { ratePlan, roomType } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { conflict, invalid, notFound } from '$lib/server/cqrs/errors';
import type { UpsertRatePlan } from './contract';

export const upsertRatePlan: CommandHandler<typeof UpsertRatePlan> = async ({ id, ...input }, { db, actor }) => {
	const [type] = await db
		.select()
		.from(roomType)
		.where(and(eq(roomType.id, input.roomTypeId), eq(roomType.propertyId, actor.propertyId)));
	if (!type) throw notFound('Room type');
	if (input.includedOccupancy > type.maxOccupancy) throw invalid(`${type.name} sleeps at most ${type.maxOccupancy}`);

	const others = await db
		.select({ id: ratePlan.id, isDefault: ratePlan.isDefault, active: ratePlan.active })
		.from(ratePlan)
		.where(and(eq(ratePlan.roomTypeId, type.id), id ? ne(ratePlan.id, id) : undefined));
	const isDefault = input.isDefault || !others.some((o) => o.isDefault); // first plan becomes default
	if (!isDefault && !input.active && !others.some((o) => o.active)) throw conflict('A room type needs at least one active rate plan');
	if (isDefault) await db.update(ratePlan).set({ isDefault: false }).where(and(eq(ratePlan.roomTypeId, type.id), eq(ratePlan.isDefault, true)));

	const values = { ...input, isDefault, active: isDefault ? true : input.active };
	if (id) {
		const [row] = await db
			.update(ratePlan)
			.set(values)
			.where(and(eq(ratePlan.id, id), eq(ratePlan.propertyId, actor.propertyId), eq(ratePlan.roomTypeId, type.id)))
			.returning({ id: ratePlan.id });
		if (!row) throw notFound('Rate plan');
		return { ratePlanId: row.id };
	}
	const [row] = await db
		.insert(ratePlan)
		.values({ ...values, propertyId: actor.propertyId })
		.returning({ id: ratePlan.id });
	return { ratePlanId: row!.id };
};
