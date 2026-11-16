import { and, asc, eq, inArray } from 'drizzle-orm';
import { nightsOf } from '$lib/shared/domain/dates';
import { refundableCents, reversedItemIds } from '$lib/shared/domain/folio';
import { folio, folioItem, folioItemTax, folioPayment, reservation, staffUser } from '$lib/server/db/schema';
import { sumTaxLines } from '$lib/shared/domain/tax';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import { notFound } from '$lib/server/cqrs/errors';
import { businessDate, loadProperty } from '$lib/server/domain/property';
import type { GetFolioLedger } from './contract';

export const getFolioLedger: QueryHandler<typeof GetFolioLedger> = async ({ reservationId }, { db, actor, now }) => {
	const [res] = await db
		.select()
		.from(reservation)
		.where(and(eq(reservation.id, reservationId), eq(reservation.propertyId, actor.propertyId)));
	if (!res) throw notFound('Reservation');
	const p = await loadProperty(db, actor.propertyId);

	const folios = await db.select().from(folio).where(eq(folio.reservationId, res.id)).orderBy(asc(folio.createdAt));
	const folioIds = folios.map((f) => f.id);
	const [items, payments] = folioIds.length
		? await Promise.all([
				db
					.select({ i: folioItem, staffName: staffUser.name })
					.from(folioItem)
					.innerJoin(staffUser, eq(staffUser.id, folioItem.staffUserId))
					.where(inArray(folioItem.folioId, folioIds))
					.orderBy(asc(folioItem.postedAt)),
				db
					.select({ p: folioPayment, staffName: staffUser.name })
					.from(folioPayment)
					.innerJoin(staffUser, eq(staffUser.id, folioPayment.staffUserId))
					.where(inArray(folioPayment.folioId, folioIds))
					.orderBy(asc(folioPayment.paidAt))
			])
		: [[], []];

	const itemTaxRows = items.length ? await db.select().from(folioItemTax).where(inArray(folioItemTax.folioItemId, items.map((x) => x.i.id))) : [];
	const reversed = reversedItemIds(items.map((x) => x.i));
	const allPayments = payments.map((x) => x.p);
	const liveRoomDates = new Set(items.filter((x) => x.i.type === 'ROOM' && !x.i.reversesItemId && !reversed.has(x.i.id)).map((x) => x.i.serviceDate));

	const sum = (pred: (t: (typeof items)[number]['i']) => boolean) => items.filter((x) => pred(x.i)).reduce((s, x) => s + x.i.totalCents, 0);

	return {
		reservationId: res.id,
		reservationStatus: res.status,
		currency: p.currency,
		timezone: p.timezone,
		businessDate: businessDate(p, now),
		folios: folios.map((f) => ({
			id: f.id,
			label: f.label,
			payerName: f.payerName,
			isPrimary: f.isPrimary,
			receivesRoomCharges: f.receivesRoomCharges,
			status: f.status,
			companyName: f.companyName,
			taxId: f.taxId,
			billingAddress: f.billingAddress,
			invoiceNumber: f.invoiceNumber,
			invoiceIssuedAt: f.invoiceIssuedAt?.toISOString() ?? null,
			totalChargesCents: f.totalChargesCents,
			totalPaymentsCents: f.totalPaymentsCents,
			balanceCents: f.balanceCents,
			taxSummary: sumTaxLines(
				itemTaxRows
					.filter((t) => items.some((x) => x.i.id === t.folioItemId && x.i.folioId === f.id))
					.map((t) => ({ ruleId: t.taxRuleId, name: t.name, amountCents: t.amountCents }))
			).map(({ name, amountCents }) => ({ name, amountCents })),
			items: items
				.filter((x) => x.i.folioId === f.id)
				.map(({ i, staffName }) => ({
					id: i.id,
					type: i.type,
					category: i.category,
					description: i.description,
					quantity: i.quantity,
					unitPriceCents: i.unitPriceCents,
					amountCents: i.amountCents,
					taxCents: i.taxCents,
					totalCents: i.totalCents,
					serviceDate: i.serviceDate,
					postedAt: i.postedAt.toISOString(),
					staffName,
					reversesItemId: i.reversesItemId,
					voided: reversed.has(i.id),
					voidReason: i.voidReason
				})),
			payments: payments
				.filter((x) => x.p.folioId === f.id)
				.map(({ p: pay, staffName }) => ({
					id: pay.id,
					method: pay.method,
					kind: pay.kind,
					amountCents: pay.amountCents,
					referenceNo: pay.referenceNo,
					reason: pay.reason,
					paidAt: pay.paidAt.toISOString(),
					staffName,
					relatedPaymentId: pay.relatedPaymentId,
					refundableCents: refundableCents(pay, allPayments),
					voidable: pay.kind === 'PAYMENT' && !allPayments.some((o) => o.relatedPaymentId === pay.id)
				}))
		})),
		balanceDueCents: folios.reduce((s, f) => s + f.balanceCents, 0),
		roomChargesCents: sum((i) => i.type === 'ROOM'),
		posOrdersCents: sum((i) => i.type !== 'ROOM'),
		paymentsCents: allPayments.reduce((s, x) => s + x.amountCents, 0),
		unpostedNights: nightsOf(res.checkIn, res.checkOut).filter((d) => !liveRoomDates.has(d))
	};
};
