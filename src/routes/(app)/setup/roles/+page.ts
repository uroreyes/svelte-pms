import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { askOrThrow } from '$lib/shared/cqrs/client';
import { can } from '$lib/shared/domain/permissions';
import { GetPermissions } from '$lib/features/access/get-permissions/contract';

export const load: PageLoad = async ({ fetch, depends, parent }) => {
	depends('app:access');
	const { actor } = await parent();
	if (!can(actor.permissions, 'roles.manage')) redirect(307, '/setup');
	return { matrix: await askOrThrow(GetPermissions, {}, fetch) };
};
