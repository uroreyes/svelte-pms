import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import { id } from '$lib/shared/cqrs/schemas';
import type { HousekeepingStatus, ReservationSource, ReservationStatus } from '$lib/shared/domain/enums';

export interface ReservationDetailView {
	businessDate: string;
	currency: string;
	reservation: {
		id: string;
		confirmationCode: string;
		status: ReservationStatus;
		source: ReservationSource;
		externalRef: string | null;
		checkIn: string;
		checkOut: string;
		nights: number;
		adults: number;
		children: number;
		quotedTotalCents: number;
		overbooked: boolean;
		notes: string | null;
		depositCents: number | null;
		depositReference: string | null;
		roomType: { id: string; name: string };
		ratePlan: { id: string | null; name: string; refundable: boolean; breakfastIncluded: boolean };
		booking: { code: string; rooms: { id: string; confirmationCode: string; roomTypeName: string; status: ReservationStatus }[] } | null;
		room: { id: string; roomNumber: string; housekeepingStatus: HousekeepingStatus } | null;
	};
	guest: {
		firstName: string;
		lastName: string;
		email: string | null;
		phone: string | null;
		idDocumentType: string | null;
		/** Only the last 4 characters are ever exposed. */
		idDocumentMasked: string | null;
	};
	rooms: { id: string; roomNumber: string; housekeepingStatus: HousekeepingStatus; ready: boolean; free: boolean }[];
	/** For modify-reservation. */
	roomTypes: { id: string; name: string; maxOccupancy: number; plans: { id: string | null; name: string }[] }[];
	/** For in-house room moves: every room, free from today until departure. */
	moveTargets: { id: string; roomNumber: string; roomTypeName: string; housekeepingStatus: HousekeepingStatus; ready: boolean; free: boolean }[];
	checkInBlockers: string[];
}

export const GetReservation = query<ReservationDetailView>()({
	name: 'reservations.detail',
	path: '/api/reservations/detail',
	permission: 'reservations.view',
	input: z.object({ reservationId: id })
});
