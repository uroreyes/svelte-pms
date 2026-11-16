import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { askOrThrow } from '$lib/shared/cqrs/client';
import { can } from '$lib/shared/domain/permissions';
import { GetCashierReport } from '$lib/features/reports/get-cashier-report/contract';

export const load: PageLoad = async ({ fetch, url, parent }) => {
	const { actor } = await parent();
	if (!can(actor.permissions, 'reports.view')) redirect(307, '/reports/audit');
	return {
		report: await askOrThrow(
			GetCashierReport,
			{ from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined, staffUserId: url.searchParams.get('staff') || undefined },
			fetch
		)
	};
};
