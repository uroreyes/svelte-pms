import { staffCommand } from '$lib/server/cqrs/endpoint';
import { CancelReservation } from '$lib/features/reservations/cancel-reservation/contract';
import { cancelReservationHandler } from '$lib/features/reservations/cancel-reservation/handler.server';

export const POST = staffCommand(CancelReservation, cancelReservationHandler);
