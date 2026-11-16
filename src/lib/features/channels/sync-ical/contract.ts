import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id } from '$lib/shared/cqrs/schemas';

export const SyncIcal = command<{ created: number; cancelled: number; unchanged: number; overbooked: number }>()({
	name: 'channels.syncIcal',
	path: '/api/channels/ical/sync',
	permission: 'channels.manage',
	input: z.object({ mappingId: id })
});
