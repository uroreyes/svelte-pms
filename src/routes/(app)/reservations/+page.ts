import type { PageLoad } from './$types';
import { askOrThrow } from '$lib/shared/cqrs/client';
import { SearchReservations } from '$lib/features/reservations/search-reservations/contract';
import { RESERVATION_STATUSES, type ReservationStatus } from '$lib/shared/domain/enums';

export const load: PageLoad = async ({ fetch, url, depends }) => {
	depends('app:reservations');
	const status = url.searchParams.get('status') as ReservationStatus | null;
	const filters = {
		q: url.searchParams.get('q') ?? undefined,
		arrival: url.searchParams.get('arrival') ?? undefined,
		status: status && RESERVATION_STATUSES.includes(status) ? status : undefined
	};
	return {
		filters,
		results: await askOrThrow(SearchReservations, filters, fetch),
		newForm: url.searchParams.get('new') === '1'
			? {
					roomTypeId: url.searchParams.get('roomTypeId') ?? undefined,
					checkIn: url.searchParams.get('checkIn') ?? undefined,
					roomUnitId: url.searchParams.get('roomUnitId') ?? undefined
				}
			: null
	};
};
