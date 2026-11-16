import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id } from '$lib/shared/cqrs/schemas';

export const UnblockRoom = command<{ blockId: string }>()({
	name: 'reservations.unblockRoom',
	path: '/api/reservations/room-blocks/remove',
	permission: 'tapeChart.manage',
	input: z.object({ blockId: id })
});
