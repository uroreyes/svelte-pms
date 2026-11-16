import { staffQuery } from '$lib/server/cqrs/endpoint';
import { GetCashierReport } from '$lib/features/reports/get-cashier-report/contract';
import { getCashierReport } from '$lib/features/reports/get-cashier-report/handler.server';

export const GET = staffQuery(GetCashierReport, getCashierReport);
