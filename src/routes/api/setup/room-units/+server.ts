import { staffCommand } from '$lib/server/cqrs/endpoint';
import { CreateRoomUnit } from '$lib/features/setup/create-room-unit/contract';
import { createRoomUnit } from '$lib/features/setup/create-room-unit/handler.server';

export const POST = staffCommand(CreateRoomUnit, createRoomUnit);
