import { staffCommand } from '$lib/server/cqrs/endpoint';
import { BlockRoom } from '$lib/features/reservations/block-room/contract';
import { blockRoom } from '$lib/features/reservations/block-room/handler.server';

export const POST = staffCommand(BlockRoom, blockRoom);
