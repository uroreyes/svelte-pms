import { staffQuery } from '$lib/server/cqrs/endpoint';
import { GetDashboard } from '$lib/features/insights/get-dashboard/contract';
import { getDashboard } from '$lib/features/insights/get-dashboard/handler.server';

export const GET = staffQuery(GetDashboard, getDashboard);
