import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, isoDate } from '$lib/shared/cqrs/schemas';

export const ModifyReservation = command<{ reservationId: string; quotedTotalCents: number }>()({
	name: 'reservations.modify',
	path: '/api/reservations/modify',
	permission: 'reservations.manage',
	input: z.object({
		reservationId: id,
		checkIn: isoDate.optional(),
		checkOut: isoDate.optional(),
		roomTypeId: id.optional(),
		adults: z.number().int().min(1).max(20).optional(),
		children: z.number().int().min(0).max(20).optional(),
		/** Required semantics: omitted = keep current plan (or the new room type's default plan). */
		ratePlanId: id.optional(),
		/** Re-price kept nights at today's rates (default: keep booked rates). Party / plan / room-type changes always re-price. */
		repriceExisting: z.boolean().default(false)
	})
});
