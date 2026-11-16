import type { PageLoad } from './$types';
import { askOrThrow } from '$lib/shared/cqrs/client';
import { can } from '$lib/shared/domain/permissions';
import { GetReservation } from '$lib/features/reservations/get-reservation/contract';
import { GetFolioLedger } from '$lib/features/folio/get-folio-ledger/contract';
import { GetPosCatalog } from '$lib/features/folio/get-pos-catalog/contract';
import { GetAuditLog } from '$lib/features/audit/get-audit-log/contract';

/** Reservation workspace = independent read models, fetched in parallel; each one gated by its permission. */
export const load: PageLoad = async ({ fetch, params, depends, parent }) => {
	depends('app:reservation', 'app:folio');
	const { actor } = await parent();
	const p = actor.permissions;
	const [detail, ledger, catalog, history] = await Promise.all([
		askOrThrow(GetReservation, { reservationId: params.id }, fetch),
		can(p, 'folio.view') ? askOrThrow(GetFolioLedger, { reservationId: params.id }, fetch) : null,
		can(p, 'pos.post') ? askOrThrow(GetPosCatalog, {}, fetch) : null,
		askOrThrow(GetAuditLog, { reservationId: params.id, limit: 200 }, fetch)
	]);
	return { detail, ledger, catalog, history };
};
