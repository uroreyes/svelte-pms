/** Shared by every Setup tab: one read model, refreshed via depends("app:setup"). */
import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { askOrThrow } from '$lib/shared/cqrs/client';
import { can } from '$lib/shared/domain/permissions';
import { homePath } from '$lib/shared/ui/nav';
import { GetSetup } from '$lib/features/setup/get-setup/contract';

export const load: LayoutLoad = async ({ fetch, depends, parent }) => {
	depends('app:setup');
	const { actor } = await parent();
	if (!can(actor.permissions, 'setup.manage')) redirect(307, homePath(actor.permissions) ?? '/');
	return { setup: await askOrThrow(GetSetup, {}, fetch) };
};
