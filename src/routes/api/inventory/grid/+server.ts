import { staffQuery } from '$lib/server/cqrs/endpoint';
import { GetInventoryGrid } from '$lib/features/inventory/get-inventory-grid/contract';
import { getInventoryGrid } from '$lib/features/inventory/get-inventory-grid/handler.server';

export const GET = staffQuery(GetInventoryGrid, getInventoryGrid);
