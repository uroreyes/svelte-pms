import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, shortText } from '$lib/shared/cqrs/schemas';

export const MoveRoom = command<{ reservationId: string; roomNumber: string }>()({
	name: 'reservations.moveRoom',
	path: '/api/reservations/move-room',
	permission: 'reservations.manage',
	input: z.object({ reservationId: id, roomUnitId: id, reason: shortText(200) })
});
