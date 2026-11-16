import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { cents, shortText } from '$lib/shared/cqrs/schemas';

export const CreateRoomType = command<{ roomTypeId: string }>()({
	name: 'setup.createRoomType',
	path: '/api/setup/room-types',
	permission: 'setup.manage',
	input: z
		.object({
			name: shortText(60),
			baseRateCents: cents,
			baseOccupancy: z.number().int().min(1).max(20),
			maxOccupancy: z.number().int().min(1).max(20),
			amenities: z.array(shortText(40)).max(30).default([])
		})
		.refine((v) => v.maxOccupancy >= v.baseOccupancy, { message: 'Max occupancy must be ≥ base occupancy', path: ['maxOccupancy'] })
});
