import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { guestInput, id, isoDate, optionalText, party } from '$lib/shared/cqrs/schemas';

export const CreateReservation = command<{ reservationId: string; confirmationCode: string; totalCents: number }>()({
	name: 'reservations.create',
	path: '/api/reservations',
	permission: 'reservations.manage',
	input: z.object({
		roomTypeId: id,
		checkIn: isoDate,
		checkOut: isoDate,
		...party,
		guest: guestInput,
		roomUnitId: id.optional(),
		ratePlanId: id.nullable().optional(),
		notes: optionalText(1000)
	})
});
