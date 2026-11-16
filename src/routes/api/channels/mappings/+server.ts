import { staffCommand } from '$lib/server/cqrs/endpoint';
import { UpsertChannelMapping } from '$lib/features/channels/upsert-mapping/contract';
import { upsertChannelMapping } from '$lib/features/channels/upsert-mapping/handler.server';

export const POST = staffCommand(UpsertChannelMapping, upsertChannelMapping);
