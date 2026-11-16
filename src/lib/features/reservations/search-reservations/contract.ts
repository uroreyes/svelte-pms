import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import { isoDate } from '$lib/shared/cqrs/schemas';
import { RESERVATION_STATUSES, type ReservationSource, type ReservationStatus } from '$lib/shared/domain/enums';

export interface ReservationListItem {
	id: string;
	confirmationCode: string;
	guestName: string;
	roomTypeName: string;
	roomNumber: string | null;
	checkIn: string;
	checkOut: string;
	status: ReservationStatus;
	source: ReservationSource;
	overbooked: boolean;
}

export const SearchReservations = query<{ items: ReservationListItem[] }>()({
	name: 'reservations.search',
	path: '/api/reservations/search',
	permission: 'reservations.view',
	input: z.object({
		q: z.string().trim().max(60).optional(),
		arrival: isoDate.optional(),
		status: z.enum(RESERVATION_STATUSES).optional(),
		limit: z.coerce.number().int().min(1).max(200).default(50)
	})
});
