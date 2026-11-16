import { staffCommand } from '$lib/server/cqrs/endpoint';
import { BulkUpdateInventory } from '$lib/features/inventory/bulk-update-inventory/contract';
import { bulkUpdateInventory } from '$lib/features/inventory/bulk-update-inventory/handler.server';

export const POST = staffCommand(BulkUpdateInventory, bulkUpdateInventory);
