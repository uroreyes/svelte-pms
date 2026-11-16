import { and, asc, eq } from 'drizzle-orm';
import { legacyRules, type TaxRule } from '$lib/shared/domain/tax';
import type { Executor } from '../db/client';
import { taxRule } from '../db/schema';
import type { PropertyRow } from './property';

/** Active tax rules of a property; falls back to the legacy single rate if none were ever configured. */
export async function loadTaxRules(db: Executor, p: Pick<PropertyRow, 'id' | 'taxRateBp'>): Promise<TaxRule[]> {
	const rows = await db
		.select()
		.from(taxRule)
		.where(and(eq(taxRule.propertyId, p.id), eq(taxRule.active, true)))
		.orderBy(asc(taxRule.sortOrder), asc(taxRule.createdAt));
	if (rows.length === 0) return legacyRules(p.taxRateBp);
	return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, rateBp: r.rateBp, amountCents: r.amountCents, appliesTo: r.appliesTo, inclusive: r.inclusive }));
}
