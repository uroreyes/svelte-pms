import { staffQuery } from '$lib/server/cqrs/endpoint';
import { GetPosCatalog } from '$lib/features/folio/get-pos-catalog/contract';
import { getPosCatalog } from '$lib/features/folio/get-pos-catalog/handler.server';

export const GET = staffQuery(GetPosCatalog, getPosCatalog);
