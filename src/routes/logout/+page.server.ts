import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { getDb } from '$lib/server/db';
import { revokeSession, SESSION_COOKIE } from '$lib/server/auth/session';
import { recordAuthEvent } from '$lib/server/audit/record';

export const load = () => redirect(303, '/');

export const actions: Actions = {
	default: async ({ cookies, locals }) => {
		const token = cookies.get(SESSION_COOKIE);
		if (token) await revokeSession(getDb(), token);
		if (locals.actor) await recordAuthEvent(getDb(), { command: 'auth.logout', actor: locals.actor, propertyId: locals.actor.propertyId, email: locals.actor.email });
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/login');
	}
};
