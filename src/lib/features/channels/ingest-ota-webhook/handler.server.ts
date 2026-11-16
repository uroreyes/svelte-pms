import { and, eq, isNull } from 'drizzle-orm';
import { channelMapping, reservation } from '$lib/server/db/schema';
import type { PublicCommandHandler } from '$lib/server/cqrs/execute';
import { notFound } from '$lib/server/cqrs/errors';
import { cancelReservation, createReservation, lockReservation } from '$lib/server/domain/reservations';
import type { IngestOtaReservation } from './contract';

/**
 * Inbound OTA booking. Signature is verified by the route adapter before this runs.
 * Idempotent on (property, source, external_ref). OTA sales are accepted even when local
 * inventory is exhausted (the sale already happened) and flagged `overbooked` for follow-up.
 */
export const ingestOtaReservation: PublicCommandHandler<typeof IngestOtaReservation> = async (input, { db, now }) => {
	const [mapping] = await db
		.select()
		.from(channelMapping)
		.where(
			and(
				eq(channelMapping.channelName, input.channel),
				eq(channelMapping.externalRoomId, input.externalRoomId),
				input.externalRateId ? eq(channelMapping.externalRateId, input.externalRateId) : isNull(channelMapping.externalRateId),
				eq(channelMapping.active, true)
			)
		);
	if (!mapping) throw notFound('Channel room mapping');

	const [existing] = await db
		.select({ id: reservation.id, code: reservation.confirmationCode, overbooked: reservation.overbooked })
		.from(reservation)
		.where(and(eq(reservation.propertyId, mapping.propertyId), eq(reservation.source, input.channel), eq(reservation.externalRef, input.externalReservationId)));

	if (input.event === 'CANCEL') {
		if (!existing) return { reservationId: null, confirmationCode: null, overbooked: false, outcome: 'IGNORED' };
		const res = await lockReservation(db, mapping.propertyId, existing.id);
		if (res.status !== 'CONFIRMED') return { reservationId: res.id, confirmationCode: res.confirmationCode, overbooked: res.overbooked, outcome: 'IGNORED' };
		await cancelReservation(db, res, now);
		return { reservationId: res.id, confirmationCode: res.confirmationCode, overbooked: res.overbooked, outcome: 'CANCELLED' };
	}

	if (existing) return { reservationId: existing.id, confirmationCode: existing.code, overbooked: existing.overbooked, outcome: 'DUPLICATE' };

	const created = await createReservation(db, {
		propertyId: mapping.propertyId,
		roomTypeId: mapping.roomTypeId,
		checkIn: input.checkIn,
		checkOut: input.checkOut,
		adults: input.adults,
		children: input.children,
		guest: input.guest,
		source: input.channel,
		externalRef: input.externalReservationId,
		ratePlanId: mapping.ratePlanId,
		overbookPolicy: 'flag'
	});
	if (created.overbooked) console.warn(`[channels] OVERBOOKING via ${input.channel}: ${created.confirmationCode}`);
	return { reservationId: created.reservationId, confirmationCode: created.confirmationCode, overbooked: created.overbooked, outcome: 'CREATED' };
};
