import { and, eq } from 'drizzle-orm';
import { catalogItem } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { notFound } from '$lib/server/cqrs/errors';
import type { UpsertCatalogItem } from './contract';

export const upsertCatalogItem: CommandHandler<typeof UpsertCatalogItem> = async ({ id, ...fields }, { db, actor }) => {
	if (id) {
		const [row] = await db
			.update(catalogItem)
			.set(fields)
			.where(and(eq(catalogItem.id, id), eq(catalogItem.propertyId, actor.propertyId)))
			.returning({ id: catalogItem.id });
		if (!row) throw notFound('Catalog item');
		return { catalogItemId: row.id };
	}
	const [row] = await db
		.insert(catalogItem)
		.values({ ...fields, propertyId: actor.propertyId })
		.returning({ id: catalogItem.id });
	return { catalogItemId: row!.id };
};
