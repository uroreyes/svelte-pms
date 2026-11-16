import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, shortText } from '$lib/shared/cqrs/schemas';
import { CHANNEL_NAMES } from '$lib/shared/domain/enums';

const httpsUrl = z
	.url({ protocol: /^https$/ })
	.max(2000)
	.optional()
	.or(z.literal('').transform(() => undefined));

export const UpsertChannelMapping = command<{ mappingId: string }>()({
	name: 'channels.upsertMapping',
	path: '/api/channels/mappings',
	permission: 'channels.manage',
	input: z.object({
		id: id.optional(),
		roomTypeId: id,
		channelName: z.enum(CHANNEL_NAMES),
		externalRoomId: shortText(100),
		ratePlanId: id.optional().nullable(),
		externalRateId: z.string().trim().max(100).optional().transform((v) => (v ? v : undefined)),
		icalUrl: httpsUrl,
		pushUrl: httpsUrl,
		active: z.boolean().default(true)
	})
});
