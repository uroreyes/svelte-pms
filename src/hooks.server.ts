import type { Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { resolveSession, SESSION_COOKIE } from '$lib/server/auth/session';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.actor = token ? await resolveSession(getDb(), token) : null;

	const response = await resolve(event);
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
	return response;
};
