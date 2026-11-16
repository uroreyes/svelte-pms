import { staffCommand } from '$lib/server/cqrs/endpoint';
import { UpsertRatePlan } from '$lib/features/setup/upsert-rate-plan/contract';
import { upsertRatePlan } from '$lib/features/setup/upsert-rate-plan/handler.server';

export const POST = staffCommand(UpsertRatePlan, upsertRatePlan);
