import { staffCommand } from '$lib/server/cqrs/endpoint';
import { RefundPayment } from '$lib/features/folio/refund-payment/contract';
import { refundPayment } from '$lib/features/folio/refund-payment/handler.server';

export const POST = staffCommand(RefundPayment, refundPayment);
