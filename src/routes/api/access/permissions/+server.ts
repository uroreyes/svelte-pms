import { staffQuery } from '$lib/server/cqrs/endpoint';
import { GetPermissions } from '$lib/features/access/get-permissions/contract';
import { getPermissions } from '$lib/features/access/get-permissions/handler.server';

export const GET = staffQuery(GetPermissions, getPermissions);
