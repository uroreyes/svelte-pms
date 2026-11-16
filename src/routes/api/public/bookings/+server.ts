import { publicCommand } from '$lib/server/cqrs/endpoint';
import { CreateBooking } from '$lib/features/booking-engine/create-booking/contract';
import { createBooking } from '$lib/features/booking-engine/create-booking/handler.server';

export const POST = publicCommand(CreateBooking, createBooking, { rate: { limit: 5, windowMs: 60_000 } });
