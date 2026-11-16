import { staffCommand } from '$lib/server/cqrs/endpoint';
import { ModifyReservation } from '$lib/features/reservations/modify-reservation/contract';
import { modifyReservation } from '$lib/features/reservations/modify-reservation/handler.server';

export const POST = staffCommand(ModifyReservation, modifyReservation);
