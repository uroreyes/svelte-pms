import type { CommandHandler } from '$lib/server/cqrs/execute';
import { createReservation } from '$lib/server/domain/reservations';
import type { CreateReservation } from './contract';

export const createFrontDeskReservation: CommandHandler<typeof CreateReservation> = async (input, { db, actor }) => {
	const created = await createReservation(db, {
		...input,
		propertyId: actor.propertyId,
		source: 'FRONT_DESK',
		overbookPolicy: 'reject'
	});
	return { reservationId: created.reservationId, confirmationCode: created.confirmationCode, totalCents: created.totalCents };
};
