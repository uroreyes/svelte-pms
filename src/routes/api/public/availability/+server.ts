import { publicQuery } from '$lib/server/cqrs/endpoint';
import { SearchAvailability } from '$lib/features/booking-engine/search-availability/contract';
import { searchAvailability } from '$lib/features/booking-engine/search-availability/handler.server';

export const GET = publicQuery(SearchAvailability, searchAvailability, { rate: { limit: 60, windowMs: 60_000 } });
