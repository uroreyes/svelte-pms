import { staffCommand } from '$lib/server/cqrs/endpoint';
import { RecordPayment } from '$lib/features/folio/record-payment/contract';
import { recordPayment } from '$lib/features/folio/record-payment/handler.server';

export const POST = staffCommand(RecordPayment, recordPayment);
