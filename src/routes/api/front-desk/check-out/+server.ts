import { staffCommand } from '$lib/server/cqrs/endpoint';
import { CheckOut } from '$lib/features/front-desk/check-out/contract';
import { checkOut } from '$lib/features/front-desk/check-out/handler.server';

export const POST = staffCommand(CheckOut, checkOut);
