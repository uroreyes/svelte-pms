import { staffCommand } from '$lib/server/cqrs/endpoint';
import { SetRoomStatus } from '$lib/features/housekeeping/set-room-status/contract';
import { setRoomStatus } from '$lib/features/housekeeping/set-room-status/handler.server';

export const POST = staffCommand(SetRoomStatus, setRoomStatus);
