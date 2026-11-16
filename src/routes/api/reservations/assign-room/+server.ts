import { staffCommand } from '$lib/server/cqrs/endpoint';
import { AssignRoom } from '$lib/features/reservations/assign-room/contract';
import { assignRoom } from '$lib/features/reservations/assign-room/handler.server';

export const POST = staffCommand(AssignRoom, assignRoom);
