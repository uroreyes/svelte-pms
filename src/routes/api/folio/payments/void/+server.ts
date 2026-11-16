import { staffCommand } from '$lib/server/cqrs/endpoint';
import { VoidPayment } from '$lib/features/folio/void-payment/contract';
import { voidPayment } from '$lib/features/folio/void-payment/handler.server';

export const POST = staffCommand(VoidPayment, voidPayment);
