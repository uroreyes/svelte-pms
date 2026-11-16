import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id } from '$lib/shared/cqrs/schemas';
import { HOUSEKEEPING_STATUSES } from '$lib/shared/domain/enums';

export const SetRoomStatus = command<{ roomUnitId: string }>()({
	name: 'housekeeping.setRoomStatus',
	path: '/api/housekeeping/status',
	permission: 'housekeeping.manage',
	input: z.object({ roomUnitId: id, status: z.enum(HOUSEKEEPING_STATUSES) })
});
