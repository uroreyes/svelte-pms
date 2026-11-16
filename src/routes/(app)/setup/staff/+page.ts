import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { askOrThrow } from '$lib/shared/cqrs/client';
import { can } from '$lib/shared/domain/permissions';
import { GetStaff } from '$lib/features/staff/get-staff/contract';

export const load: PageLoad = async ({ fetch, depends, parent }) => {
	depends('app:staff');
	const { actor } = await parent();
	if (!can(actor.permissions, 'staff.manage')) redirect(307, '/setup');
	return { staff: await askOrThrow(GetStaff, {}, fetch) };
};
