import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { cents, id, optionalText, shortText } from '$lib/shared/cqrs/schemas';

export const CheckIn = command<{ reservationId: string; folioId: string; postedNights: number }>()({
	name: 'frontDesk.checkIn',
	path: '/api/front-desk/check-in',
	permission: 'frontDesk.manage',
	input: z.object({
		reservationId: id,
		/** Optional when the reservation is already allocated a room. */
		roomUnitId: id.optional(),
		idDocumentType: shortText(40),
		idDocumentNumber: shortText(60),
		/** Security deposit / card pre-authorisation (not a folio payment). */
		depositCents: cents.optional(),
		depositReference: optionalText(80)
	})
});
