import { staffCommand } from '$lib/server/cqrs/endpoint';
import { BulkUpdateRatePlan } from '$lib/features/inventory/bulk-update-rate-plan/contract';
import { bulkUpdateRatePlan } from '$lib/features/inventory/bulk-update-rate-plan/handler.server';

export const POST = staffCommand(BulkUpdateRatePlan, bulkUpdateRatePlan);
