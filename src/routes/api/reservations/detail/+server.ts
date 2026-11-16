import { staffQuery } from '$lib/server/cqrs/endpoint';
import { GetReservation } from '$lib/features/reservations/get-reservation/contract';
import { getReservation } from '$lib/features/reservations/get-reservation/handler.server';

export const GET = staffQuery(GetReservation, getReservation);
