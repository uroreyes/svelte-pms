import { staffCommand } from '$lib/server/cqrs/endpoint';
import { PostCharge } from '$lib/features/folio/post-charge/contract';
import { postCharge } from '$lib/features/folio/post-charge/handler.server';

export const POST = staffCommand(PostCharge, postCharge);
