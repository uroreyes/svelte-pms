import { loadTaxRules } from '$lib/server/domain/taxes';
import { and, asc, eq } from 'drizzle-orm';
import { catalogItem } from '$lib/server/db/schema';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import { loadProperty } from '$lib/server/domain/property';
import type { GetPosCatalog } from './contract';

export const getPosCatalog: QueryHandler<typeof GetPosCatalog> = async (_input, { db, actor }) => {
	const [p, items] = await Promise.all([
		loadProperty(db, actor.propertyId),
		db
			.select({ id: catalogItem.id, category: catalogItem.category, name: catalogItem.name, unitPriceCents: catalogItem.unitPriceCents, taxable: catalogItem.taxable })
			.from(catalogItem)
			.where(and(eq(catalogItem.propertyId, actor.propertyId), eq(catalogItem.active, true)))
			.orderBy(asc(catalogItem.category), asc(catalogItem.name))
	]);
	return { currency: p.currency, taxRules: await loadTaxRules(db, p), items };
};
