import { staffQuery } from '$lib/server/cqrs/endpoint';
import { GetSetup } from '$lib/features/setup/get-setup/contract';
import { getSetup } from '$lib/features/setup/get-setup/handler.server';

export const GET = staffQuery(GetSetup, getSetup);
