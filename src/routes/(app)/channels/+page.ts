import type { PageLoad } from './$types';
import { askOrThrow } from '$lib/shared/cqrs/client';
import { GetChannels } from '$lib/features/channels/get-channels/contract';

export const load: PageLoad = async ({ fetch, depends }) => {
	depends('app:channels');
	return { channels: await askOrThrow(GetChannels, {}, fetch) };
};
