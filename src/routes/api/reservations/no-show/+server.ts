import { staffCommand } from '$lib/server/cqrs/endpoint';
import { MarkNoShow } from '$lib/features/reservations/mark-no-show/contract';
import { markNoShowHandler } from '$lib/features/reservations/mark-no-show/handler.server';

export const POST = staffCommand(MarkNoShow, markNoShowHandler);
