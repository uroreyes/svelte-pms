import { staffQuery } from '$lib/server/cqrs/endpoint';
import { FindInHouseRoom } from '$lib/features/folio/find-in-house-room/contract';
import { findInHouseRoom } from '$lib/features/folio/find-in-house-room/handler.server';

export const GET = staffQuery(FindInHouseRoom, findInHouseRoom);
