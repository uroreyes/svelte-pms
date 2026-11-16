import { staffCommand } from '$lib/server/cqrs/endpoint';
import { TransferItem } from '$lib/features/folio/transfer-item/contract';
import { transferItem } from '$lib/features/folio/transfer-item/handler.server';

export const POST = staffCommand(TransferItem, transferItem);
