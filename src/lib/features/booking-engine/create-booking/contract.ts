import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { cents, guestInput, id, isoDate, optionalText } from '$lib/shared/cqrs/schemas';

export interface CreatedBooking {
	/** Booking (group) code — quote this for the whole stay. */
	confirmationCode: string;
	totalCents: number;
	rooms: { confirmationCode: string; totalCents: number }[];
}

export const CreateBooking = command<CreatedBooking>()({
	name: 'bookingEngine.book',
	path: '/api/public/bookings',
	permission: 'public',
	input: z.object({
		property: z.string().regex(/^[a-z0-9-]{1,60}$/),
		checkIn: isoDate,
		checkOut: isoDate,
		rooms: z
			.array(
				z.object({
					roomTypeId: id,
					ratePlanId: id.nullable().optional(),
					adults: z.number().int().min(1).max(20),
					children: z.number().int().min(0).max(20).default(0)
				})
			)
			.min(1)
			.max(5),
		guest: guestInput.extend({ email: z.email().max(254) }),
		notes: optionalText(500),
		/** The total the guest saw for ALL rooms; the server re-quotes and rejects on mismatch. */
		expectedTotalCents: cents
	})
});
