import { loadTaxRules } from '$lib/server/domain/taxes';
import { and, eq } from 'drizzle-orm';
import { priceLine } from '$lib/shared/domain/money';
import { catalogItem } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { conflict, forbidden, notFound } from '$lib/server/cqrs/errors';
import { appendItem, lockFolio, reservationOfFolio } from '$lib/server/domain/folio';
import { loadProperty } from '$lib/server/domain/property';
import type { PostCharge } from './contract';

/** "Add order to room": POS / front desk post incidentals to a checked-in guest's folio. */
export const postCharge: CommandHandler<typeof PostCharge> = async ({ folioId, quantity, line }, { db, actor, permissions }) => {
	if (line.kind === 'discount' && !permissions.has('folio.manage')) throw forbidden('Discounts require front office permissions');

	const f = await lockFolio(db, actor.propertyId, folioId);
	const res = await reservationOfFolio(db, f);
	if (res.status !== 'CHECKED_IN') throw conflict('Charges can only be posted to checked-in guests');
	const p = await loadProperty(db, actor.propertyId);

	let entry: { category: string; description: string; unitPriceCents: number; taxable: boolean; sign: 1 | -1; type: 'POS_ORDER' | 'DISCOUNT' };
	switch (line.kind) {
		case 'catalog': {
			const [item] = await db
				.select()
				.from(catalogItem)
				.where(and(eq(catalogItem.id, line.catalogItemId), eq(catalogItem.propertyId, actor.propertyId), eq(catalogItem.active, true)));
			if (!item) throw notFound('Catalog item');
			entry = { category: item.category, description: item.name, unitPriceCents: item.unitPriceCents, taxable: item.taxable, sign: 1, type: 'POS_ORDER' };
			break;
		}
		case 'custom':
			entry = { ...line, sign: 1, type: 'POS_ORDER' };
			break;
		case 'discount':
			entry = { category: 'DISCOUNT', description: line.description, unitPriceCents: line.amountCents, taxable: true, sign: -1, type: 'DISCOUNT' };
			break;
	}

	const priced = priceLine(quantity, entry.unitPriceCents * entry.sign, entry.taxable ? await loadTaxRules(db, p) : []);
	const itemId = await appendItem(db, f, {
		type: entry.type,
		category: entry.category,
		description: entry.description,
		quantity,
		unitPriceCents: entry.unitPriceCents * entry.sign,
		amountCents: priced.amountCents,
		taxCents: priced.taxCents,
		totalCents: priced.totalCents,
		taxes: priced.taxes,
		staffUserId: actor.userId
	});
	return { itemId, totalCents: priced.totalCents };
};
