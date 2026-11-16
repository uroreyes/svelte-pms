import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id } from '$lib/shared/cqrs/schemas';

export const AssignRoom = command<{ reservationId: string }>()({
	name: 'reservations.assignRoom',
	path: '/api/reservations/assign-room',
	permission: 'reservations.manage',
	/** roomUnitId null = move back to "unallocated" */
	input: z.object({ reservationId: id, roomUnitId: id.nullable() })
});
