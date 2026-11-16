import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import { id, isoDate } from '$lib/shared/cqrs/schemas';
import type { PaymentKind, PaymentMethod } from '$lib/shared/domain/enums';

export interface CashierLine {
	paymentId: string;
	paidAt: string;
	reservationId: string;
	confirmationCode: string;
	guestName: string;
	folioLabel: string;
	invoiceNumber: string | null;
	method: PaymentMethod;
	kind: PaymentKind;
	amountCents: number;
	referenceNo: string | null;
	staffUserId: string;
	staffName: string;
}

export interface CashierReportView {
	from: string;
	to: string;
	currency: string;
	timezone: string;
	staff: { id: string; name: string }[];
	lines: CashierLine[];
	byMethod: { method: PaymentMethod; count: number; cents: number }[];
	byStaff: { staffName: string; count: number; cents: number }[];
	totalCents: number;
}

export const GetCashierReport = query<CashierReportView>()({
	name: 'reports.cashier',
	path: '/api/reports/cashier',
	permission: 'reports.view',
	/** Dates are business dates in the property timezone, inclusive. */
	input: z
		.object({ from: isoDate.optional(), to: isoDate.optional(), staffUserId: id.optional() })
		.refine((v) => !v.from || !v.to || v.to >= v.from, { message: 'End must be on or after start', path: ['to'] })
});
