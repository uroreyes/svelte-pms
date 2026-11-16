import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { currencyCode, ianaTimezone, shortText } from '$lib/shared/cqrs/schemas';
import { ROOM_POSTING_MODES } from '$lib/shared/domain/enums';

export const UpdatePropertySettings = command<{ propertyId: string }>()({
	name: 'setup.updatePropertySettings',
	path: '/api/setup/property',
	permission: 'setup.manage',
	input: z.object({
		name: shortText(120),
		address: z.string().trim().max(300),
		currency: currencyCode,
		timezone: ianaTimezone,
		roomPostingMode: z.enum(ROOM_POSTING_MODES)
	})
});
