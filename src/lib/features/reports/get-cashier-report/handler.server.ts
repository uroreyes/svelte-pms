import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { diffDays } from '$lib/shared/domain/dates';
import { PAYMENT_METHODS } from '$lib/shared/domain/enums';
import { folio, folioPayment, guest, reservation, staffUser } from '$lib/server/db/schema';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import { invalid } from '$lib/server/cqrs/errors';
import { businessDate, loadProperty } from '$lib/server/domain/property';
import type { GetCashierReport } from './contract';

/** Every payment, refund and void in the window — reconciles to the sum of folio payments. */
export const getCashierReport: QueryHandler<typeof GetCashierReport> = async (input, { db, actor, now }) => {
	const p = await loadProperty(db, actor.propertyId);
	const today = businessDate(p, now);
	const from = input.from ?? today;
	const to = input.to ?? from;
	if (diffDays(from, to) > 92) throw invalid('Range is limited to 3 months');

	const filters: SQL[] = [
		eq(folio.propertyId, p.id),
		sql`(${folioPayment.paidAt} AT TIME ZONE ${p.timezone})::date BETWEEN ${from}::date AND ${to}::date`
	];
	if (input.staffUserId) filters.push(eq(folioPayment.staffUserId, input.staffUserId));

	const [rows, staff] = await Promise.all([
		db
			.select({ pay: folioPayment, folioLabel: folio.label, invoiceNumber: folio.invoiceNumber, res: reservation, first: guest.firstName, last: guest.lastName, staffName: staffUser.name })
			.from(folioPayment)
			.innerJoin(folio, eq(folio.id, folioPayment.folioId))
			.innerJoin(reservation, eq(reservation.id, folio.reservationId))
			.innerJoin(guest, eq(guest.id, reservation.guestId))
			.innerJoin(staffUser, eq(staffUser.id, folioPayment.staffUserId))
			.where(and(...filters))
			.orderBy(asc(folioPayment.paidAt)),
		db.select({ id: staffUser.id, name: staffUser.name }).from(staffUser).where(eq(staffUser.propertyId, p.id)).orderBy(asc(staffUser.name))
	]);

	const lines = rows.map((r) => ({
		paymentId: r.pay.id,
		paidAt: r.pay.paidAt.toISOString(),
		reservationId: r.res.id,
		confirmationCode: r.res.confirmationCode,
		guestName: `${r.last}, ${r.first}`,
		folioLabel: r.folioLabel,
		invoiceNumber: r.invoiceNumber,
		method: r.pay.method,
		kind: r.pay.kind,
		amountCents: r.pay.amountCents,
		referenceNo: r.pay.referenceNo,
		staffUserId: r.pay.staffUserId,
		staffName: r.staffName
	}));
	const staffNames = [...new Set(lines.map((l) => l.staffName))];
	return {
		from,
		to,
		currency: p.currency,
		timezone: p.timezone,
		staff,
		lines,
		byMethod: PAYMENT_METHODS.map((method) => {
			const m = lines.filter((l) => l.method === method);
			return { method, count: m.length, cents: m.reduce((s, l) => s + l.amountCents, 0) };
		}),
		byStaff: staffNames.map((staffName) => {
			const m = lines.filter((l) => l.staffName === staffName);
			return { staffName, count: m.length, cents: m.reduce((s, l) => s + l.amountCents, 0) };
		}),
		totalCents: lines.reduce((s, l) => s + l.amountCents, 0)
	};
};
