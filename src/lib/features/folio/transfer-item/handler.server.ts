import { eq } from 'drizzle-orm';
import { folioItem } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { invalid, notFound } from '$lib/server/cqrs/errors';
import { appendItem, itemTaxes, lockFolio, reverseItem } from '$lib/server/domain/folio';
import type { TransferItem } from './contract';

/** Split billing: reverse the line on the source folio and re-post it on the target folio. */
export const transferItem: CommandHandler<typeof TransferItem> = async ({ itemId, targetFolioId, reason }, { db, actor }) => {
	const [original] = await db.select().from(folioItem).where(eq(folioItem.id, itemId));
	if (!original) throw notFound('Folio line');
	if (original.folioId === targetFolioId) throw invalid('Line is already on that folio');

	// Lock both folios in a deterministic order to avoid deadlocks.
	const [firstId, secondId] = [original.folioId, targetFolioId].sort() as [string, string];
	const first = await lockFolio(db, actor.propertyId, firstId);
	const second = await lockFolio(db, actor.propertyId, secondId);
	const source = first.id === original.folioId ? first : second;
	const target = first.id === targetFolioId ? first : second;
	if (source.reservationId !== target.reservationId) throw invalid('Folios belong to different reservations');

	await reverseItem(db, source, original, reason, actor.userId);
	const newItemId = await appendItem(db, target, {
		type: original.type,
		category: original.category,
		description: original.description,
		quantity: original.quantity,
		unitPriceCents: original.unitPriceCents,
		amountCents: original.amountCents,
		taxCents: original.taxCents,
		totalCents: original.totalCents,
		serviceDate: original.serviceDate,
		staffUserId: actor.userId,
		taxes: await itemTaxes(db, original.id)
	});
	return { newItemId };
};
