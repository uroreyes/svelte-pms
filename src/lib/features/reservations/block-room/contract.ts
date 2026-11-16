import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, isoDate, shortText } from '$lib/shared/cqrs/schemas';

export const BlockRoom = command<{ blockId: string }>()({
	name: 'reservations.blockRoom',
	path: '/api/reservations/room-blocks',
	permission: 'tapeChart.manage',
	input: z
		.object({ roomUnitId: id, startDate: isoDate, endDate: isoDate, reason: shortText(120) })
		.refine((v) => v.endDate > v.startDate, { message: 'End must be after start', path: ['endDate'] })
});
