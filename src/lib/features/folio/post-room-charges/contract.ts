import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, isoDate } from '$lib/shared/cqrs/schemas';

export const PostRoomCharges = command<{ posted: number }>()({
	name: 'folio.postRoomCharges',
	path: '/api/folio/room-charges',
	permission: 'folio.manage',
	/** Posts every unposted night up to and including `through` (default: whole stay, e.g. before checkout). */
	input: z.object({ reservationId: id, through: isoDate.optional() })
});
