import { and, eq, ne } from 'drizzle-orm';
import type { IsoDate } from '$lib/shared/domain/dates';
import type { Tx } from '../db/client';
import { channelMapping, channelOutbox } from '../db/schema';

/** Enqueue an ARI push for every push-capable channel mapped to the room type (same tx as the change). */
export async function enqueueAri(tx: Tx, propertyId: string, roomTypeId: string, from: IsoDate, toExclusive: IsoDate): Promise<number> {
	const mappings = await tx
		.select({ id: channelMapping.id })
		.from(channelMapping)
		.where(and(eq(channelMapping.roomTypeId, roomTypeId), eq(channelMapping.active, true), ne(channelMapping.channelName, 'ICAL')));
	if (mappings.length === 0) return 0;
	await tx.insert(channelOutbox).values(mappings.map((m) => ({ propertyId, channelMappingId: m.id, fromDate: from, toDate: toExclusive })));
	return mappings.length;
}
