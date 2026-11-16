import type { PageLoad } from './$types';
import { askOrThrow } from '$lib/shared/cqrs/client';
import { GetTapeChart } from '$lib/features/reservations/get-tape-chart/contract';

export const load: PageLoad = async ({ fetch, url, depends }) => {
	depends('app:tape');
	const start = url.searchParams.get('start') ?? undefined;
	const days = url.searchParams.get('days') ?? undefined;
	return { chart: await askOrThrow(GetTapeChart, { start, days: days ? Number(days) : undefined }, fetch) };
};
