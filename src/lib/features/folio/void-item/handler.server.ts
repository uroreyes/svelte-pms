import { eq } from 'drizzle-orm';
import { folioItem } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { notFound } from '$lib/server/cqrs/errors';
import { lockFolio, reverseItem } from '$lib/server/domain/folio';
import type { VoidItem } from './contract';

/** Never deletes: appends a negated reversal row linked to the original. */
export const voidItem: CommandHandler<typeof VoidItem> = async ({ itemId, reason }, { db, actor }) => {
	const [original] = await db.select().from(folioItem).where(eq(folioItem.id, itemId));
	if (!original) throw notFound('Folio line');
	const f = await lockFolio(db, actor.propertyId, original.folioId);
	return { reversalItemId: await reverseItem(db, f, original, reason, actor.userId) };
};
