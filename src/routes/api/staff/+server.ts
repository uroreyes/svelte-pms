import { staffQuery } from '$lib/server/cqrs/endpoint';
import { GetStaff } from '$lib/features/staff/get-staff/contract';
import { getStaff } from '$lib/features/staff/get-staff/handler.server';

export const GET = staffQuery(GetStaff, getStaff);
