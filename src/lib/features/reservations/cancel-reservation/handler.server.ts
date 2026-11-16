import type { CommandHandler } from '$lib/server/cqrs/execute';
import { cancelReservation, lockReservation } from '$lib/server/domain/reservations';
import type { CancelReservation } from './contract';

export const cancelReservationHandler: CommandHandler<typeof CancelReservation> = async ({ reservationId }, { db, actor, now }) => {
	const res = await lockReservation(db, actor.propertyId, reservationId);
	await cancelReservation(db, res, now);
	return { reservationId: res.id };
};
