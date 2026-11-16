import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';

export const ProcessOutbox = command<{ sent: number; failed: number; dryRun: number }>()({
	name: 'channels.processOutbox',
	path: '/api/channels/outbox/process',
	permission: 'channels.manage',
	input: z.object({ limit: z.number().int().min(1).max(200).default(50) })
});
