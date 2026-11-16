import type { PageLoad } from './$types';
import { askOrThrow } from '$lib/shared/cqrs/client';
import { GetDashboard } from '$lib/features/insights/get-dashboard/contract';

export const load: PageLoad = async ({ fetch, url }) => ({
	dashboard: await askOrThrow(GetDashboard, { from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined }, fetch)
});
