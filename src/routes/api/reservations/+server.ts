import { staffCommand } from '$lib/server/cqrs/endpoint';
import { CreateReservation } from '$lib/features/reservations/create-reservation/contract';
import { createFrontDeskReservation } from '$lib/features/reservations/create-reservation/handler.server';

export const POST = staffCommand(CreateReservation, createFrontDeskReservation);
