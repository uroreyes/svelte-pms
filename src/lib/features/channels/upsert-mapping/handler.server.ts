import { resolvePlan } from '$lib/server/domain/rate-plans';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { channelMapping, roomType } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { notFound } from '$lib/server/cqrs/errors';
import type { UpsertChannelMapping } from './contract';

export const upsertChannelMapping: CommandHandler<typeof UpsertChannelMapping> = async ({ id, ...input }, { db, actor }) => {
	const [type] = await db
		.select({ id: roomType.id })
		.from(roomType)
		.where(and(eq(roomType.id, input.roomTypeId), eq(roomType.propertyId, actor.propertyId)));
	if (!type) throw notFound('Room type');
	if (input.ratePlanId) await resolvePlan(db, actor.propertyId, input.roomTypeId, input.ratePlanId);
	const values = { ...input, ratePlanId: input.ratePlanId ?? null, externalRateId: input.externalRateId ?? null, icalUrl: input.icalUrl ?? null, pushUrl: input.pushUrl ?? null };

	if (id) {
		const [row] = await db
			.update(channelMapping)
			.set(values)
			.where(and(eq(channelMapping.id, id), eq(channelMapping.propertyId, actor.propertyId)))
			.returning({ id: channelMapping.id });
		if (!row) throw notFound('Channel mapping');
		return { mappingId: row.id };
	}
	const [row] = await db
		.insert(channelMapping)
		.values({ ...values, propertyId: actor.propertyId, exportToken: randomBytes(24).toString('base64url') })
		.returning({ id: channelMapping.id });
	return { mappingId: row!.id };
};
