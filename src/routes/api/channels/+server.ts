import { staffQuery } from '$lib/server/cqrs/endpoint';
import { GetChannels } from '$lib/features/channels/get-channels/contract';
import { getChannels } from '$lib/features/channels/get-channels/handler.server';

export const GET = staffQuery(GetChannels, getChannels);
