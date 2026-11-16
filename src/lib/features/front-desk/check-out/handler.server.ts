import { loadTaxRules } from '$lib/server/domain/taxes';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { addDays, nightsOf } from '$lib/shared/domain/dates';
import { refundableCents, reversedItemIds } from '$lib/shared/domain/folio';
import { formatMoney, quoteStay } from '$lib/shared/domain/money';
import { folio, folioItem, folioPayment, reservation, reservationNight, roomUnit } from '$lib/server/db/schema';
import type { Tx } from '$lib/server/db/client';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { conflict, invalid } from '$lib/server/cqrs/errors';
import { appendPayment, lockReservationFolios, postedRoomDates, reverseItem } from '$lib/server/domain/folio';
import { releaseInventory } from '$lib/server/domain/inventory';
import { nextInvoiceNumber } from '$lib/server/domain/invoice';
import { enqueueAri } from '$lib/server/domain/outbox';
import { businessDate, loadProperty, type PropertyRow } from '$lib/server/domain/property';
import { lockReservation, type ReservationRow } from '$lib/server/domain/reservations';
import type { CheckOut } from './contract';

/** Shortens the stay to today; voids already-posted charges for the released nights. */
async function releaseUnused(tx: Tx, res: ReservationRow, p: PropertyRow, today: string, staffUserId: string): Promise<string[]> {
	const newCheckOut = today > res.checkIn ? today : addDays(res.checkIn, 1); // the first night is always kept
	const released = nightsOf(newCheckOut, res.checkOut);
	if (released.length === 0) return [];

	const folios = await lockReservationFolios(tx, res.id);
	const items = await tx
		.select({ i: folioItem })
		.from(folioItem)
		.innerJoin(folio, eq(folio.id, folioItem.folioId))
		.where(and(eq(folio.reservationId, res.id), eq(folioItem.type, 'ROOM')));
	const reversed = reversedItemIds(items.map((x) => x.i));
	for (const { i } of items) {
		if (i.reversesItemId || reversed.has(i.id) || !i.serviceDate || !released.includes(i.serviceDate)) continue;
		await reverseItem(tx, folios.find((f) => f.id === i.folioId)!, i, 'Early departure — night released', staffUserId);
	}

	await releaseInventory(tx, res.roomTypeId, released);
	await tx.delete(reservationNight).where(and(eq(reservationNight.reservationId, res.id), inArray(reservationNight.date, released)));
	const nights = await tx.select({ date: reservationNight.date, rateCents: reservationNight.rateCents }).from(reservationNight).where(eq(reservationNight.reservationId, res.id));
	await tx
		.update(reservation)
		.set({ checkOut: newCheckOut, quotedTotalCents: quoteStay(nights, await loadTaxRules(tx, p), res.adults + res.children).totalCents })
		.where(eq(reservation.id, res.id));
	await enqueueAri(tx, p.id, res.roomTypeId, newCheckOut, res.checkOut);
	res.checkOut = newCheckOut;
	return released;
}

export const checkOut: CommandHandler<typeof CheckOut> = async ({ reservationId, payments, releaseUnusedNights, settleWith }, { db, actor, now }) => {
	const p = await loadProperty(db, actor.propertyId);
	const today = businessDate(p, now);
	const res = await lockReservation(db, actor.propertyId, reservationId);
	if (res.status !== 'CHECKED_IN') throw conflict(`Cannot check out a reservation that is ${res.status}`);

	const releasedNights = releaseUnusedNights && today < res.checkOut ? await releaseUnused(db, res, p, today, actor.userId) : [];

	const posted = await postedRoomDates(db, res.id);
	const unposted = nightsOf(res.checkIn, res.checkOut).filter((d) => !posted.has(d));
	if (unposted.length > 0) {
		throw conflict(`${unposted.length} room night(s) are not yet posted to the folio`, { reason: 'UNPOSTED_ROOM_CHARGES', dates: unposted });
	}

	// Re-read after any early-departure reversals so balances are current.
	const folios = await lockReservationFolios(db, res.id);
	for (const pay of payments) {
		const f = folios.find((x) => x.id === pay.folioId);
		if (!f) throw invalid('Payment references a folio of another reservation');
		if (pay.amountCents > f.balanceCents) throw conflict(`Payment exceeds the balance of folio "${f.label}"`);
		await appendPayment(db, f, { method: pay.method, kind: 'PAYMENT', amountCents: pay.amountCents, referenceNo: pay.referenceNo ?? null, staffUserId: actor.userId });
		f.balanceCents -= pay.amountCents;
	}
	if (settleWith) {
		for (const f of folios) {
			if (f.balanceCents > 0) {
				await appendPayment(db, f, { method: settleWith.method, kind: 'PAYMENT', amountCents: f.balanceCents, referenceNo: settleWith.referenceNo ?? null, staffUserId: actor.userId });
				f.balanceCents = 0;
				continue;
			}
			// In credit (e.g. prepaid, then left early): refund against this folio's own payments, newest first.
			const siblings = f.balanceCents < 0 ? await db.select().from(folioPayment).where(eq(folioPayment.folioId, f.id)).orderBy(desc(folioPayment.paidAt)) : [];
			for (const pay of siblings) {
				if (f.balanceCents >= 0) break;
				const amount = Math.min(refundableCents(pay, siblings), -f.balanceCents);
				if (amount <= 0) continue;
				await appendPayment(db, f, { method: pay.method, kind: 'REFUND', amountCents: -amount, referenceNo: pay.referenceNo, relatedPaymentId: pay.id, reason: 'Refund of credit at check-out', staffUserId: actor.userId });
				f.balanceCents += amount;
			}
		}
	}

	// Balance Due must be exactly 0.00 on every folio.
	const settled = await db.select().from(folio).where(eq(folio.reservationId, res.id)).orderBy(asc(folio.createdAt));
	const outstanding = settled.filter((f) => f.balanceCents !== 0);
	if (outstanding.length > 0) {
		throw conflict(
			outstanding
				.map((f) => (f.balanceCents > 0 ? `${f.label}: ${formatMoney(f.balanceCents, p.currency)} due` : `${f.label}: ${formatMoney(-f.balanceCents, p.currency)} to refund`))
				.join('; '),
			{ reason: 'BALANCE_NOT_ZERO', folios: outstanding.map((f) => ({ folioId: f.id, balanceCents: f.balanceCents })) }
		);
	}

	// Gap-free invoice number for every folio that carries ledger activity (same tx → rolled back with a failed checkout).
	const ids = settled.map((f) => f.id);
	const [withItems, withPayments] = ids.length
		? await Promise.all([
				db.selectDistinct({ id: folioItem.folioId }).from(folioItem).where(inArray(folioItem.folioId, ids)),
				db.selectDistinct({ id: folioPayment.folioId }).from(folioPayment).where(inArray(folioPayment.folioId, ids))
			])
		: [[], []];
	const active = new Set([...withItems, ...withPayments].map((x) => x.id));
	const invoices: { folioId: string; invoiceNumber: string }[] = [];
	for (const f of settled) {
		const invoiceNumber = active.has(f.id) && !f.invoiceNumber ? await nextInvoiceNumber(db, p.id, p.invoicePrefix) : f.invoiceNumber;
		if (invoiceNumber) invoices.push({ folioId: f.id, invoiceNumber });
		await db
			.update(folio)
			.set({ status: 'SETTLED', settledAt: now, invoiceNumber, invoiceIssuedAt: invoiceNumber ? (f.invoiceIssuedAt ?? now) : null })
			.where(eq(folio.id, f.id));
	}
	await db.update(reservation).set({ status: 'CHECKED_OUT', checkedOutAt: now }).where(eq(reservation.id, res.id));
	if (res.roomUnitId) await db.update(roomUnit).set({ housekeepingStatus: 'DIRTY' }).where(eq(roomUnit.id, res.roomUnitId));

	return { reservationId: res.id, invoices, releasedNights };
};
