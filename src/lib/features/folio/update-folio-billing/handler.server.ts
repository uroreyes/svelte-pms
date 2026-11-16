import { eq } from 'drizzle-orm';
import { folio } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { assertOpen, lockFolio } from '$lib/server/domain/folio';
import type { UpdateFolioBilling } from './contract';

/** Billing details are editable until the invoice is issued at settlement. */
export const updateFolioBilling: CommandHandler<typeof UpdateFolioBilling> = async (input, { db, actor }) => {
	const f = await lockFolio(db, actor.propertyId, input.folioId);
	assertOpen(f);
	await db
		.update(folio)
		.set({ payerName: input.payerName, companyName: input.companyName ?? null, taxId: input.taxId ?? null, billingAddress: input.billingAddress ?? null })
		.where(eq(folio.id, f.id));
	return { folioId: f.id };
};
