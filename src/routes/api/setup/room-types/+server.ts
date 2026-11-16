import { staffCommand } from '$lib/server/cqrs/endpoint';
import { CreateRoomType } from '$lib/features/setup/create-room-type/contract';
import { createRoomType } from '$lib/features/setup/create-room-type/handler.server';

export const POST = staffCommand(CreateRoomType, createRoomType);
