import { publicQuery } from '$lib/server/cqrs/endpoint';
import { GetConfirmation } from '$lib/features/booking-engine/get-confirmation/contract';
import { getConfirmation } from '$lib/features/booking-engine/get-confirmation/handler.server';

export const GET = publicQuery(GetConfirmation, getConfirmation, { rate: { limit: 20, windowMs: 60_000 } });
