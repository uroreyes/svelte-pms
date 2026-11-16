import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import { month } from '$lib/shared/cqrs/schemas';

export interface InventoryCell {
	date: string;
	availableCount: number;
	soldCount: number;
	remaining: number;
	rateCents: number;
	isOverride: boolean;
	minLos: number | null;
	isClosed: boolean;
}

export interface InventoryGridView {
	month: string;
	currency: string;
	dates: { date: string; dow: number }[];
	roomTypes: { id: string; name: string; baseRateCents: number; units: number; cells: InventoryCell[]; plans: { id: string; name: string }[] }[];
}

export const GetInventoryGrid = query<InventoryGridView>()({
	name: 'inventory.grid',
	path: '/api/inventory/grid',
	permission: 'inventory.view',
	input: z.object({ month })
});
