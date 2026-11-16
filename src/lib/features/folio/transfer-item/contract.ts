import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, shortText } from '$lib/shared/cqrs/schemas';

export const TransferItem = command<{ newItemId: string }>()({
	name: 'folio.transferItem',
	path: '/api/folio/charges/transfer',
	permission: 'folio.manage',
	input: z.object({ itemId: id, targetFolioId: id, reason: shortText(200).default('Transferred between folios') })
});
