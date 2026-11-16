/** Gap-free invoice numbering. Must run inside the settlement transaction. */
import { sql } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { invoiceCounter } from '../db/schema';

export function formatInvoiceNumber(prefix: string, n: number): string {
	return `${prefix}${String(n).padStart(6, '0')}`;
}

/**
 * UPDATE … RETURNING takes the counter row lock until commit, so concurrent settlements
 * serialise and a rolled-back checkout returns its number (no gaps, unlike a SEQUENCE).
 */
export async function nextInvoiceNumber(tx: Tx, propertyId: string, prefix: string): Promise<string> {
	await tx.insert(invoiceCounter).values({ propertyId, lastNumber: 0 }).onConflictDoNothing();
	const [row] = await tx
		.update(invoiceCounter)
		.set({ lastNumber: sql`${invoiceCounter.lastNumber} + 1` })
		.where(sql`${invoiceCounter.propertyId} = ${propertyId}`)
		.returning({ n: invoiceCounter.lastNumber });
	return formatInvoiceNumber(prefix, row!.n);
}
