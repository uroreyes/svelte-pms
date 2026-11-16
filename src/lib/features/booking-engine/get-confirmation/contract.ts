import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import { shortText } from '$lib/shared/cqrs/schemas';
import type { ReservationStatus } from '$lib/shared/domain/enums';

export interface BookingConfirmationView {
	propertyName: string;
	currency: string;
	confirmationCode: string;
	guestName: string;
	checkIn: string;
	checkOut: string;
	totalCents: number;
	rooms: {
		confirmationCode: string;
		roomTypeName: string;
		ratePlanName: string;
		adults: number;
		children: number;
		status: ReservationStatus;
		totalCents: number;
		nights: { date: string; rateCents: number }[];
	}[];
}

export const GetConfirmation = query<BookingConfirmationView>()({
	name: 'bookingEngine.confirmation',
	path: '/api/public/confirmation',
	permission: 'public',
	/** Booking or room code AND last name — prevents enumeration by code alone. */
	input: z.object({ property: z.string().regex(/^[a-z0-9-]{1,60}$/), code: z.string().regex(/^[A-Z0-9]{6,12}$/), lastName: shortText(60) })
});
