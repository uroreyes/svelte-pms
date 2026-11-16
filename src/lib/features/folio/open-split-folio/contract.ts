import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, shortText } from '$lib/shared/cqrs/schemas';

export const OpenSplitFolio = command<{ folioId: string }>()({
	name: 'folio.openSplit',
	path: '/api/folio/split',
	permission: 'folio.manage',
	input: z.object({
		reservationId: id,
		label: shortText(40),
		payerName: shortText(120),
		/** e.g. "company pays room": future room nights route to this folio */
		routeRoomCharges: z.boolean().default(false)
	})
});
