import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import type { HousekeepingStatus } from '$lib/shared/domain/enums';

export interface RoomBoardView {
	businessDate: string;
	rooms: {
		id: string;
		roomNumber: string;
		floor: number;
		roomTypeName: string;
		housekeepingStatus: HousekeepingStatus;
		occupant: { reservationId: string; guestName: string; checkOut: string } | null;
		arrivalToday: { reservationId: string; guestName: string } | null;
	}[];
}

export const GetRoomBoard = query<RoomBoardView>()({
	name: 'housekeeping.board',
	path: '/api/housekeeping/board',
	permission: 'housekeeping.view',
	input: z.object({})
});
