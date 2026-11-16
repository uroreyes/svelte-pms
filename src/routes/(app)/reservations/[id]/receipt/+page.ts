import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { askOrThrow } from '$lib/shared/cqrs/client';
import { can } from '$lib/shared/domain/permissions';
import { GetReservation } from '$lib/features/reservations/get-reservation/contract';
import { GetFolioLedger } from '$lib/features/folio/get-folio-ledger/contract';

export const load: PageLoad = async ({ fetch, params, parent }) => {
	const { actor } = await parent();
	if (!can(actor.permissions, 'folio.view')) redirect(307, '/reservations/' + params.id);
	const [detail, ledger] = await Promise.all([
		askOrThrow(GetReservation, { reservationId: params.id }, fetch),
		askOrThrow(GetFolioLedger, { reservationId: params.id }, fetch)
	]);
	return { detail, ledger };
};
