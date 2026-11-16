import { staffQuery } from '$lib/server/cqrs/endpoint';
import { GetTapeChart } from '$lib/features/reservations/get-tape-chart/contract';
import { getTapeChart } from '$lib/features/reservations/get-tape-chart/handler.server';

export const GET = staffQuery(GetTapeChart, getTapeChart);
