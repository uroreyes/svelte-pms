import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { channelMapping, channelOutbox, ratePlan, reservation, roomType } from '$lib/server/db/schema';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import type { GetChannels } from './contract';

export const getChannels: QueryHandler<typeof GetChannels> = async (_input, { db, actor }) => {
	const pid = actor.propertyId;
	const plans = await db.select({ id: ratePlan.id, name: ratePlan.name, roomTypeId: ratePlan.roomTypeId }).from(ratePlan).where(and(eq(ratePlan.propertyId, pid), eq(ratePlan.active, true))).orderBy(asc(ratePlan.name));
	const [types, mappings, counts, recent, overbooked] = await Promise.all([
		db.select({ id: roomType.id, name: roomType.name }).from(roomType).where(eq(roomType.propertyId, pid)).orderBy(asc(roomType.name)),
		db
			.select({ m: channelMapping, roomTypeName: roomType.name })
			.from(channelMapping)
			.innerJoin(roomType, eq(roomType.id, channelMapping.roomTypeId))
			.where(eq(channelMapping.propertyId, pid))
			.orderBy(asc(roomType.name), asc(channelMapping.channelName)),
		db
			.select({ status: channelOutbox.status, n: sql<number>`count(*)::int` })
			.from(channelOutbox)
			.where(eq(channelOutbox.propertyId, pid))
			.groupBy(channelOutbox.status),
		db
			.select({ o: channelOutbox, channelName: channelMapping.channelName, roomTypeName: roomType.name })
			.from(channelOutbox)
			.innerJoin(channelMapping, eq(channelMapping.id, channelOutbox.channelMappingId))
			.innerJoin(roomType, eq(roomType.id, channelMapping.roomTypeId))
			.where(eq(channelOutbox.propertyId, pid))
			.orderBy(desc(channelOutbox.createdAt))
			.limit(20),
		db
			.select()
			.from(reservation)
			.where(and(eq(reservation.propertyId, pid), eq(reservation.overbooked, true), eq(reservation.status, 'CONFIRMED')))
			.orderBy(asc(reservation.checkIn))
	]);
	const count = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
	return {
		roomTypes: types.map((t) => ({ ...t, plans: plans.filter((pl) => pl.roomTypeId === t.id).map(({ id, name }) => ({ id, name })) })),
		mappings: mappings.map(({ m, roomTypeName }) => ({
			id: m.id,
			roomTypeId: m.roomTypeId,
			roomTypeName,
			channelName: m.channelName,
			externalRoomId: m.externalRoomId,
			ratePlanId: m.ratePlanId,
			ratePlanName: plans.find((pl) => pl.id === m.ratePlanId)?.name ?? null,
			externalRateId: m.externalRateId,
			icalUrl: m.icalUrl,
			pushUrl: m.pushUrl,
			exportPath: `/api/public/ical/${m.exportToken}`,
			active: m.active,
			lastSyncedAt: m.lastSyncedAt?.toISOString() ?? null,
			lastSyncError: m.lastSyncError
		})),
		outbox: { pending: count('PENDING'), sent: count('SENT'), failed: count('FAILED') },
		recent: recent.map(({ o, channelName, roomTypeName }) => ({
			id: o.id,
			channelName,
			roomTypeName,
			fromDate: o.fromDate,
			toDate: o.toDate,
			status: o.status,
			attempts: o.attempts,
			lastError: o.lastError,
			createdAt: o.createdAt.toISOString()
		})),
		overbooked: overbooked.map((r) => ({ reservationId: r.id, confirmationCode: r.confirmationCode, source: r.source, checkIn: r.checkIn, checkOut: r.checkOut }))
	};
};
