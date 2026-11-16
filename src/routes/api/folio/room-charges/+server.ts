import { staffCommand } from '$lib/server/cqrs/endpoint';
import { PostRoomCharges } from '$lib/features/folio/post-room-charges/contract';
import { postRoomCharges } from '$lib/features/folio/post-room-charges/handler.server';

export const POST = staffCommand(PostRoomCharges, postRoomCharges);
