import { staffCommand } from '$lib/server/cqrs/endpoint';
import { UpsertCatalogItem } from '$lib/features/setup/upsert-catalog-item/contract';
import { upsertCatalogItem } from '$lib/features/setup/upsert-catalog-item/handler.server';

export const POST = staffCommand(UpsertCatalogItem, upsertCatalogItem);
