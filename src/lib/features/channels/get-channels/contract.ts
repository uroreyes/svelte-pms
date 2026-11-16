import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import type { ChannelName, OutboxStatus } from '$lib/shared/domain/enums';

export interface ChannelsView {
	roomTypes: { id: string; name: string; plans: { id: string; name: string }[] }[];
	mappings: {
		id: string;
		roomTypeId: string;
		roomTypeName: string;
		channelName: ChannelName;
		externalRoomId: string;
		ratePlanId: string | null;
		ratePlanName: string | null;
		externalRateId: string | null;
		icalUrl: string | null;
		pushUrl: string | null;
		exportPath: string;
		active: boolean;
		lastSyncedAt: string | null;
		lastSyncError: string | null;
	}[];
	outbox: { pending: number; sent: number; failed: number };
	recent: { id: string; channelName: ChannelName; roomTypeName: string; fromDate: string; toDate: string; status: OutboxStatus; attempts: number; lastError: string | null; createdAt: string }[];
	overbooked: { reservationId: string; confirmationCode: string; source: string; checkIn: string; checkOut: string }[];
}

export const GetChannels = query<ChannelsView>()({
	name: 'channels.get',
	path: '/api/channels',
	permission: 'channels.view',
	input: z.object({})
});
