import { staffCommand } from '$lib/server/cqrs/endpoint';
import { SetDailyInventory } from '$lib/features/inventory/set-daily-inventory/contract';
import { setDailyInventory } from '$lib/features/inventory/set-daily-inventory/handler.server';

export const POST = staffCommand(SetDailyInventory, setDailyInventory);
