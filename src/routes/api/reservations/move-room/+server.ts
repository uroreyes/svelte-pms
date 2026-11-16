import { staffCommand } from '$lib/server/cqrs/endpoint';
import { MoveRoom } from '$lib/features/reservations/move-room/contract';
import { moveRoom } from '$lib/features/reservations/move-room/handler.server';

export const POST = staffCommand(MoveRoom, moveRoom);
