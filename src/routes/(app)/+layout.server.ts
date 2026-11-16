import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { loadPermissions } from '$lib/server/domain/permissions';
import { loadProperty } from '$lib/server/domain/property';

export const load: LayoutServerLoad = async ({ locals, route }) => {
	if (!locals.actor) redirect(303, '/login');
	if (locals.actor.mustChangePassword && route.id !== '/(app)/account/password') redirect(303, '/account/password');
	const { name, role, email, propertyId } = locals.actor;
	const db = getDb();
	const p = await loadProperty(db, propertyId);
	const permissions = [...(await loadPermissions(db, propertyId, role))];
	return { actor: { name, role, email, permissions, mustChangePassword: locals.actor.mustChangePassword ?? false }, property: { name: p.name, slug: p.slug, currency: p.currency } };
};
