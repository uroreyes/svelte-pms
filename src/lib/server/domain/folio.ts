/**
 * Folio ledger kernel. Ledger rows are append-only (DB trigger); folio totals are a
 * projection updated in the same transaction while the folio row is locked.
 */
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { reversedItemIds } from '$lib/shared/domain/folio';
import type { IsoDate } from '$lib/shared/domain/dates';
import type { FolioItemType, PaymentKind, PaymentMethod } from '$lib/shared/domain/enums';
import { applyTaxes, type TaxLine, type TaxRule } from '$lib/shared/domain/tax';
import type { Tx } from '../db/client';
import { folio, folioItem, folioItemTax, folioPayment, reservation, reservationNight, roomUnit } from '../db/schema';
import { conflict, notFound } from '../cqrs/errors';
import type { ReservationRow } from './reservations';

export type FolioRow = typeof folio.$inferSelect;
export type FolioItemRow = typeof folioItem.$inferSelect;
export type FolioPaymentRow = typeof folioPayment.$inferSelect;

export async function lockFolio(tx: Tx, propertyId: string, folioId: string): Promise<FolioRow> {
	const [row] = await tx
		.select()
		.from(folio)
		.where(and(eq(folio.id, folioId), eq(folio.propertyId, propertyId)))
		.for('update');
	if (!row) throw notFound('Folio');
	return row;
}

export async function lockReservationFolios(tx: Tx, reservationId: string): Promise<FolioRow[]> {
	return tx.select().from(folio).where(eq(folio.reservationId, reservationId)).orderBy(asc(folio.createdAt)).for('update');
}

export function assertOpen(f: FolioRow): void {
	if (f.status !== 'OPEN') throw conflict('This folio is settled and can no longer be changed');
}

export async function openFolio(
	tx: Tx,
	input: { propertyId: string; reservationId: string; label: string; payerName: string; isPrimary: boolean; receivesRoomCharges: boolean }
): Promise<string> {
	const [row] = await tx.insert(folio).values(input).returning({ id: folio.id });
	return row!.id;
}

async function bumpTotals(tx: Tx, folioId: string, chargesDelta: number, paymentsDelta: number): Promise<void> {
	await tx
		.update(folio)
		.set({
			totalChargesCents: sql`${folio.totalChargesCents} + ${chargesDelta}`,
			totalPaymentsCents: sql`${folio.totalPaymentsCents} + ${paymentsDelta}`,
			balanceCents: sql`${folio.balanceCents} + ${chargesDelta - paymentsDelta}`
		})
		.where(eq(folio.id, folioId));
}

export interface NewItem {
	type: FolioItemType;
	category: string;
	description: string;
	quantity: number;
	unitPriceCents: number;
	amountCents: number;
	taxCents: number;
	totalCents: number;
	serviceDate?: IsoDate | null;
	reversesItemId?: string | null;
	voidReason?: string | null;
	staffUserId: string;
	/** Breakdown of `taxCents` by tax rule; must sum to taxCents. */
	taxes?: TaxLine[];
}

/** Caller must hold the folio lock. */
export async function appendItem(tx: Tx, f: FolioRow, { taxes = [], ...item }: NewItem): Promise<string> {
	assertOpen(f);
	const [row] = await tx
		.insert(folioItem)
		.values({ ...item, folioId: f.id })
		.returning({ id: folioItem.id });
	if (taxes.length > 0) {
		await tx.insert(folioItemTax).values(taxes.map((t) => ({ folioItemId: row!.id, taxRuleId: t.ruleId, name: t.name, amountCents: t.amountCents })));
	}
	await bumpTotals(tx, f.id, item.totalCents, 0);
	return row!.id;
}

/** Tax lines of a posted item (to mirror on reversal / transfer). */
export async function itemTaxes(tx: Tx, itemId: string): Promise<TaxLine[]> {
	const rows = await tx.select().from(folioItemTax).where(eq(folioItemTax.folioItemId, itemId));
	return rows.map((r) => ({ ruleId: r.taxRuleId, name: r.name, amountCents: r.amountCents }));
}

export interface NewPayment {
	method: PaymentMethod;
	kind: PaymentKind;
	amountCents: number;
	referenceNo?: string | null;
	relatedPaymentId?: string | null;
	reason?: string | null;
	staffUserId: string;
}

/** Caller must hold the folio lock. */
export async function appendPayment(tx: Tx, f: FolioRow, payment: NewPayment): Promise<string> {
	assertOpen(f);
	const [row] = await tx
		.insert(folioPayment)
		.values({ ...payment, folioId: f.id })
		.returning({ id: folioPayment.id });
	await bumpTotals(tx, f.id, 0, payment.amountCents);
	return row!.id;
}

/** Insert the negated mirror of an item (void / transfer-out). */
export async function reverseItem(tx: Tx, f: FolioRow, original: FolioItemRow, reason: string, staffUserId: string): Promise<string> {
	if (original.reversesItemId) throw conflict('A reversal entry cannot itself be voided');
	const [already] = await tx.select({ id: folioItem.id }).from(folioItem).where(eq(folioItem.reversesItemId, original.id)).limit(1);
	if (already) throw conflict('This line has already been voided');
	return appendItem(tx, f, {
		type: original.type,
		category: original.category,
		description: `VOID: ${original.description}`,
		quantity: -original.quantity,
		unitPriceCents: original.unitPriceCents,
		amountCents: -original.amountCents,
		taxCents: -original.taxCents,
		totalCents: -original.totalCents,
		serviceDate: original.serviceDate,
		reversesItemId: original.id,
		voidReason: reason,
		staffUserId,
		taxes: (await itemTaxes(tx, original.id)).map((t) => ({ ...t, amountCents: -t.amountCents }))
	});
}

/** Service dates that already carry a live (non-reversed) ROOM charge, across all folios of a reservation. */
export async function postedRoomDates(tx: Tx, reservationId: string): Promise<Set<IsoDate>> {
	const items = await tx
		.select({ id: folioItem.id, serviceDate: folioItem.serviceDate, reversesItemId: folioItem.reversesItemId })
		.from(folioItem)
		.innerJoin(folio, eq(folio.id, folioItem.folioId))
		.where(and(eq(folio.reservationId, reservationId), eq(folioItem.type, 'ROOM'), isNotNull(folioItem.serviceDate)));
	const reversed = reversedItemIds(items);
	return new Set(items.filter((i) => !i.reversesItemId && !reversed.has(i.id)).map((i) => i.serviceDate!));
}

/** The folio room nights route to: the flagged router if open, else the primary. */
export function roomChargeFolio(folios: readonly FolioRow[]): FolioRow {
	const target = folios.find((f) => f.receivesRoomCharges && f.status === 'OPEN') ?? folios.find((f) => f.isPrimary);
	if (!target) throw conflict('Reservation has no folio');
	return target;
}

/**
 * Posts the booked nightly rate (+ tax) for each date not yet posted.
 * Caller must hold the reservation lock and the folio locks.
 */
export async function postRoomNights(
	tx: Tx,
	args: { reservation: ReservationRow; folios: readonly FolioRow[]; dates: readonly IsoDate[]; taxRules: readonly TaxRule[]; staffUserId: string }
): Promise<number> {
	if (args.dates.length === 0) return 0;
	const target = roomChargeFolio(args.folios);
	const posted = await postedRoomDates(tx, args.reservation.id);
	const nights = await tx
		.select()
		.from(reservationNight)
		.where(and(eq(reservationNight.reservationId, args.reservation.id), inArray(reservationNight.date, [...args.dates])))
		.orderBy(asc(reservationNight.date));
	let roomLabel = '';
	if (args.reservation.roomUnitId) {
		const [unit] = await tx.select({ n: roomUnit.roomNumber }).from(roomUnit).where(eq(roomUnit.id, args.reservation.roomUnitId));
		roomLabel = unit ? `Room ${unit.n} · ` : '';
	}
	let count = 0;
	for (const night of nights) {
		if (posted.has(night.date)) continue;
		const t = applyTaxes(args.taxRules, night.rateCents, { scope: 'ROOM', units: 1, guests: args.reservation.adults + args.reservation.children });
		await appendItem(tx, target, {
			type: 'ROOM',
			category: 'ROOM',
			description: `${roomLabel}Night of ${night.date}`,
			quantity: 1,
			unitPriceCents: night.rateCents,
			amountCents: t.netCents,
			taxCents: t.taxCents,
			totalCents: t.totalCents,
			serviceDate: night.date,
			staffUserId: args.staffUserId,
			taxes: t.taxes
		});
		count++;
	}
	return count;
}

/** Reservation that owns the folio, for status checks. */
export async function reservationOfFolio(tx: Tx, f: FolioRow) {
	const [row] = await tx.select().from(reservation).where(eq(reservation.id, f.reservationId)).limit(1);
	if (!row) throw notFound('Reservation');
	return row;
}
