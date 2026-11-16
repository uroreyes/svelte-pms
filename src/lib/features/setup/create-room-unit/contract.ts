import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, shortText } from '$lib/shared/cqrs/schemas';

export const CreateRoomUnit = command<{ roomUnitId: string }>()({
	name: 'setup.createRoomUnit',
	path: '/api/setup/room-units',
	permission: 'setup.manage',
	input: z.object({
		roomTypeId: id,
		roomNumber: shortText(10),
		floor: z.number().int().min(-5).max(200)
	})
});
