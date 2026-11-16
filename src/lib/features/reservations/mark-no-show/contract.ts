import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id } from '$lib/shared/cqrs/schemas';

export const MarkNoShow = command<{ reservationId: string }>()({
	name: 'reservations.markNoShow',
	path: '/api/reservations/no-show',
	permission: 'reservations.manage',
	input: z.object({ reservationId: id })
});
