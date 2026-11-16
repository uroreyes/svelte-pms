import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id } from '$lib/shared/cqrs/schemas';

export const CancelReservation = command<{ reservationId: string }>()({
	name: 'reservations.cancel',
	path: '/api/reservations/cancel',
	permission: 'reservations.manage',
	input: z.object({ reservationId: id })
});
