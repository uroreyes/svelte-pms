import { and, eq } from 'drizzle-orm';
import { taxRule } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { notFound } from '$lib/server/cqrs/errors';
import type { UpsertTaxRule } from './contract';

/** Changes apply to future postings only — posted folio lines keep their stored tax breakdown. */
export const upsertTaxRule: CommandHandler<typeof UpsertTaxRule> = async ({ id, ...input }, { db, actor }) => {
	const values = { ...input, rateBp: input.kind === 'PERCENT' ? input.rateBp : 0, amountCents: input.kind === 'PERCENT' ? 0 : input.amountCents };
	if (id) {
		const [row] = await db
			.update(taxRule)
			.set(values)
			.where(and(eq(taxRule.id, id), eq(taxRule.propertyId, actor.propertyId)))
			.returning({ id: taxRule.id });
		if (!row) throw notFound('Tax rule');
		return { taxRuleId: row.id };
	}
	const [row] = await db
		.insert(taxRule)
		.values({ ...values, propertyId: actor.propertyId })
		.returning({ id: taxRule.id });
	return { taxRuleId: row!.id };
};
