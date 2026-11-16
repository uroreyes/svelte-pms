import { staffQuery } from '$lib/server/cqrs/endpoint';
import { GetDailyOps } from '$lib/features/front-desk/get-daily-ops/contract';
import { getDailyOps } from '$lib/features/front-desk/get-daily-ops/handler.server';

export const GET = staffQuery(GetDailyOps, getDailyOps);
