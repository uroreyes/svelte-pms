import { staffCommand } from '$lib/server/cqrs/endpoint';
import { UpdateFolioBilling } from '$lib/features/folio/update-folio-billing/contract';
import { updateFolioBilling } from '$lib/features/folio/update-folio-billing/handler.server';

export const POST = staffCommand(UpdateFolioBilling, updateFolioBilling);
