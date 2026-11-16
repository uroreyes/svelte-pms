import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { guestInput, isoDate, party, shortText } from '$lib/shared/cqrs/schemas';
import { CHANNEL_NAMES } from '$lib/shared/domain/enums';

export const IngestOtaReservation = command<{ reservationId: string | null; confirmationCode: string | null; overbooked: boolean; outcome: 'CREATED' | 'DUPLICATE' | 'CANCELLED' | 'IGNORED' }>()({
	name: 'channels.ingestReservation',
	path: '/api/public/channels/webhook',
	permission: 'public',
	input: z.discriminatedUnion('event', [
		z.object({
			event: z.literal('NEW'),
			channel: z.enum(CHANNEL_NAMES).exclude(['ICAL']),
			externalReservationId: shortText(100),
			externalRoomId: shortText(100),
			externalRateId: z.string().trim().max(100).optional(),
			checkIn: isoDate,
			checkOut: isoDate,
			...party,
			guest: guestInput
		}),
		z.object({
			event: z.literal('CANCEL'),
			channel: z.enum(CHANNEL_NAMES).exclude(['ICAL']),
			externalReservationId: shortText(100),
			externalRoomId: shortText(100),
			externalRateId: z.string().trim().max(100).optional()
		})
	])
});
