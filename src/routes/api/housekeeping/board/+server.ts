import { staffQuery } from '$lib/server/cqrs/endpoint';
import { GetRoomBoard } from '$lib/features/housekeeping/get-room-board/contract';
import { getRoomBoard } from '$lib/features/housekeeping/get-room-board/handler.server';

export const GET = staffQuery(GetRoomBoard, getRoomBoard);
