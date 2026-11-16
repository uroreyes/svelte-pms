import type { PageLoad } from './$types';
import { askOrThrow } from '$lib/shared/cqrs/client';
import { GetRoomBoard } from '$lib/features/housekeeping/get-room-board/contract';

export const load: PageLoad = async ({ fetch, depends }) => {
	depends('app:housekeeping');
	return { board: await askOrThrow(GetRoomBoard, {}, fetch) };
};
