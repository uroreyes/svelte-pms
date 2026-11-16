import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import { id } from '$lib/shared/cqrs/schemas';
import type { FolioItemType, FolioStatus, PaymentKind, PaymentMethod, ReservationStatus } from '$lib/shared/domain/enums';

export interface LedgerItemView {
	id: string;
	type: FolioItemType;
	category: string;
	description: string;
	quantity: number;
	unitPriceCents: number;
	amountCents: number;
	taxCents: number;
	totalCents: number;
	serviceDate: string | null;
	postedAt: string;
	staffName: string;
	reversesItemId: string | null;
	voided: boolean;
	voidReason: string | null;
}

export interface LedgerPaymentView {
	id: string;
	method: PaymentMethod;
	kind: PaymentKind;
	amountCents: number;
	referenceNo: string | null;
	reason: string | null;
	paidAt: string;
	staffName: string;
	relatedPaymentId: string | null;
	refundableCents: number;
	voidable: boolean;
}

export interface FolioView {
	id: string;
	label: string;
	payerName: string;
	isPrimary: boolean;
	receivesRoomCharges: boolean;
	status: FolioStatus;
	companyName: string | null;
	taxId: string | null;
	billingAddress: string | null;
	invoiceNumber: string | null;
	invoiceIssuedAt: string | null;
	totalChargesCents: number;
	totalPaymentsCents: number;
	balanceCents: number;
	/** Live tax totals by tax name (reversals net out). */
	taxSummary: { name: string; amountCents: number }[];
	items: LedgerItemView[];
	payments: LedgerPaymentView[];
}

export interface FolioLedgerView {
	reservationId: string;
	reservationStatus: ReservationStatus;
	currency: string;
	/** Property IANA timezone — format every timestamp with it. */
	timezone: string;
	businessDate: string;
	folios: FolioView[];
	balanceDueCents: number;
	roomChargesCents: number;
	posOrdersCents: number;
	paymentsCents: number;
	/** Nights of the stay without a live ROOM charge. */
	unpostedNights: string[];
}

export const GetFolioLedger = query<FolioLedgerView>()({
	name: 'folio.ledger',
	path: '/api/folio/ledger',
	permission: 'folio.view',
	input: z.object({ reservationId: id })
});
