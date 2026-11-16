import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import { isoDate, qsInt } from '$lib/shared/cqrs/schemas';
import type { UnavailableReason } from '$lib/shared/domain/availability';
import type { StayQuote } from '$lib/shared/domain/money';

export interface AvailabilityOffer {
	/** Stable key for the (room type, plan) pair. */
	key: string;
	roomTypeId: string;
	ratePlanId: string | null;
	name: string;
	plan: { name: string; description: string; refundable: boolean; freeCancellationDays: number | null; breakfastIncluded: boolean };
	maxOccupancy: number;
	amenities: string[];
	bookable: boolean;
	unavailableReason: UnavailableReason | 'OCCUPANCY' | 'PLAN_CLOSED' | 'PLAN_MIN_LOS' | null;
	message: string | null;
	/** Present only when ≤ 3 left ("Only 2 rooms left"). */
	fewLeft: number | null;
	/** Max rooms of this type that can go in one booking (≤ 5). */
	maxRooms: number;
	/** Price for ONE room with the searched party. */
	quote: StayQuote;
}

export interface AvailabilityView {
	property: { name: string; currency: string; taxNotes: string[] };
	checkIn: string;
	checkOut: string;
	nights: number;
	party: { adults: number; children: number };
	offers: AvailabilityOffer[];
}

export const SearchAvailability = query<AvailabilityView>()({
	name: 'bookingEngine.search',
	path: '/api/public/availability',
	permission: 'public',
	input: z
		.object({
			property: z.string().regex(/^[a-z0-9-]{1,60}$/),
			checkIn: isoDate,
			checkOut: isoDate,
			/** Party per room. */
			adults: qsInt(1, 20).default(2),
			children: qsInt(0, 20).default(0)
		})
		.refine((v) => v.checkOut > v.checkIn, { message: 'Check-out must be after check-in', path: ['checkOut'] })
});
