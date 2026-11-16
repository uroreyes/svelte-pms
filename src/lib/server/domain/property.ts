import { eq } from 'drizzle-orm';
import { todayIn } from '$lib/shared/domain/dates';
import type { Executor } from '../db/client';
import { property } from '../db/schema';
import { notFound } from '../cqrs/errors';

export type PropertyRow = typeof property.$inferSelect;

export async function loadProperty(db: Executor, propertyId: string): Promise<PropertyRow> {
	const [row] = await db.select().from(property).where(eq(property.id, propertyId)).limit(1);
	if (!row) throw notFound('Property');
	return row;
}

export async function loadPropertyBySlug(db: Executor, slug: string): Promise<PropertyRow> {
	const [row] = await db.select().from(property).where(eq(property.slug, slug)).limit(1);
	if (!row) throw notFound('Property');
	return row;
}

/** The hotel's current business date in its own timezone. */
export function businessDate(p: Pick<PropertyRow, 'timezone'>, now: Date): string {
	return todayIn(p.timezone, now);
}
