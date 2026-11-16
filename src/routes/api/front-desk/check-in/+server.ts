import { staffCommand } from '$lib/server/cqrs/endpoint';
import { CheckIn } from '$lib/features/front-desk/check-in/contract';
import { piiKeyring } from '$lib/server/config';
import { makeCheckIn } from '$lib/features/front-desk/check-in/handler.server';

export const POST = staffCommand(CheckIn, makeCheckIn(piiKeyring));
