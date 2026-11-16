import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { can } from '$lib/shared/domain/permissions';
import { homePath } from '$lib/shared/ui/nav';
import { askOrThrow } from '$lib/shared/cqrs/client';
import { GetDailyOps } from '$lib/features/front-desk/get-daily-ops/contract';

export const load: PageLoad = async ({ fetch, url, depends, parent }) => {
	const { actor } = await parent();
	if (!can(actor.permissions, 'frontDesk.view')) {
		const home = homePath(actor.permissions);
		if (home) redirect(307, home);
		return { ops: null };
	}
	depends('app:ops');
	return { ops: await askOrThrow(GetDailyOps, { date: url.searchParams.get('date') ?? undefined }, fetch) };
};
