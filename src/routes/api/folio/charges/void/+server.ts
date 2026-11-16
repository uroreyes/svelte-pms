import { staffCommand } from '$lib/server/cqrs/endpoint';
import { VoidItem } from '$lib/features/folio/void-item/contract';
import { voidItem } from '$lib/features/folio/void-item/handler.server';

export const POST = staffCommand(VoidItem, voidItem);
