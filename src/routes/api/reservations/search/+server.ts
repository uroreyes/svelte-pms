import { staffQuery } from '$lib/server/cqrs/endpoint';
import { SearchReservations } from '$lib/features/reservations/search-reservations/contract';
import { searchReservations } from '$lib/features/reservations/search-reservations/handler.server';

export const GET = staffQuery(SearchReservations, searchReservations);
