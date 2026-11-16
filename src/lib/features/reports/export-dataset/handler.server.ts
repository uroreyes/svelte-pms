import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { dateIn, diffDays } from '$lib/shared/domain/dates';
import { folio, folioItem, folioPayment, guest, reservation, roomType, staffUser } from '$lib/server/db/schema';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import { invalid } from '$lib/server/cqrs/errors';
import { loadProperty } from '$lib/server/domain/property';
import type { ExportDataset } from './contract';

const money = (c: number) => (c / 100).toFixed(2);

/** Accountant exports. Amounts are decimal strings in the property currency; dates in the hotel timezone. */
export const exportDataset: QueryHandler<typeof ExportDataset> = async ({ dataset, from, to }, { db, actor }) => {
	if (diffDays(from, to) > 366) throw invalid('Range is limited to one year');
	const p = await loadProperty(db, actor.propertyId);
	const tz = p.timezone;
	const inRange = (col: typeof folioPayment.paidAt | typeof folioItem.postedAt) => sql`(${col} AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date`;
	const filename = `${p.slug}-${dataset}-${from}-to-${to}.csv`;

	if (dataset === 'payments') {
		const rows = await db
			.select({ pay: folioPayment, label: folio.label, inv: folio.invoiceNumber, code: reservation.confirmationCode, staff: staffUser.name })
			.from(folioPayment)
			.innerJoin(folio, eq(folio.id, folioPayment.folioId))
			.innerJoin(reservation, eq(reservation.id, folio.reservationId))
			.innerJoin(staffUser, eq(staffUser.id, folioPayment.staffUserId))
			.where(and(eq(folio.propertyId, p.id), inRange(folioPayment.paidAt)))
			.orderBy(asc(folioPayment.paidAt));
		return {
			filename,
			columns: ['date', 'time', 'confirmation_code', 'folio', 'invoice_number', 'kind', 'method', 'amount', 'currency', 'reference', 'staff'],
			rows: rows.map((r) => [
				dateIn(r.pay.paidAt, tz),
				new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(r.pay.paidAt),
				r.code,
				r.label,
				r.inv,
				r.pay.kind,
				r.pay.method,
				money(r.pay.amountCents),
				p.currency,
				r.pay.referenceNo,
				r.staff
			])
		};
	}
	if (dataset === 'folio-items') {
		const rows = await db
			.select({ i: folioItem, label: folio.label, inv: folio.invoiceNumber, code: reservation.confirmationCode, staff: staffUser.name })
			.from(folioItem)
			.innerJoin(folio, eq(folio.id, folioItem.folioId))
			.innerJoin(reservation, eq(reservation.id, folio.reservationId))
			.innerJoin(staffUser, eq(staffUser.id, folioItem.staffUserId))
			.where(and(eq(folio.propertyId, p.id), inRange(folioItem.postedAt)))
			.orderBy(asc(folioItem.postedAt));
		return {
			filename,
			columns: ['posted_date', 'service_date', 'confirmation_code', 'folio', 'invoice_number', 'type', 'category', 'description', 'quantity', 'unit_price', 'net', 'tax', 'total', 'currency', 'is_reversal', 'void_reason', 'staff'],
			rows: rows.map((r) => [
				dateIn(r.i.postedAt, tz),
				r.i.serviceDate,
				r.code,
				r.label,
				r.inv,
				r.i.type,
				r.i.category,
				r.i.description,
				r.i.quantity,
				money(r.i.unitPriceCents),
				money(r.i.amountCents),
				money(r.i.taxCents),
				money(r.i.totalCents),
				p.currency,
				r.i.reversesItemId ? 'yes' : 'no',
				r.i.voidReason,
				r.staff
			])
		};
	}
	const rows = await db
		.select({ r: reservation, first: guest.firstName, last: guest.lastName, email: guest.email, type: roomType.name })
		.from(reservation)
		.innerJoin(guest, eq(guest.id, reservation.guestId))
		.innerJoin(roomType, eq(roomType.id, reservation.roomTypeId))
		.where(and(eq(reservation.propertyId, p.id), lte(reservation.checkIn, to), gte(reservation.checkOut, from)))
		.orderBy(asc(reservation.checkIn));
	return {
		filename,
		columns: ['confirmation_code', 'status', 'source', 'external_ref', 'guest', 'email', 'room_type', 'check_in', 'check_out', 'nights', 'adults', 'children', 'quoted_total', 'currency', 'overbooked', 'created_date'],
		rows: rows.map(({ r, first, last, email, type }) => [
			r.confirmationCode,
			r.status,
			r.source,
			r.externalRef,
			`${last}, ${first}`,
			email,
			type,
			r.checkIn,
			r.checkOut,
			diffDays(r.checkIn, r.checkOut),
			r.adults,
			r.children,
			money(r.quotedTotalCents),
			p.currency,
			r.overbooked ? 'yes' : 'no',
			dateIn(r.createdAt, tz)
		])
	};
};
