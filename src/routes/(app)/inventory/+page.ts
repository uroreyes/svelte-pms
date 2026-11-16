import type { PageLoad } from './$types';
import { askOrThrow } from '$lib/shared/cqrs/client';
import { GetInventoryGrid } from '$lib/features/inventory/get-inventory-grid/contract';

export const load: PageLoad = async ({ fetch, url, depends }) => {
	depends('app:inventory');
	const month = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
	return { grid: await askOrThrow(GetInventoryGrid, { month }, fetch) };
};
