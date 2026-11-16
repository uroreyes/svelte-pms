import { staffCommand } from '$lib/server/cqrs/endpoint';
import { UnblockRoom } from '$lib/features/reservations/unblock-room/contract';
import { unblockRoom } from '$lib/features/reservations/unblock-room/handler.server';

export const POST = staffCommand(UnblockRoom, unblockRoom);
