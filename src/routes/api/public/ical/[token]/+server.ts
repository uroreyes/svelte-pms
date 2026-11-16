import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { rateLimit } from '$lib/server/security/rate-limit';
import { exportIcal } from '$lib/features/channels/export-ical/handler.server';

/** Public iCal feed per channel mapping: GET /api/public/ical/<token>(.ics) */
export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	if (!rateLimit(`ical:${getClientAddress()}`, 30, 60_000)) error(429, 'Too many requests');
	const calendar = await exportIcal(getDb(), params.token.replace(/\.ics$/, ''), new Date());
	if (!calendar) error(404, 'Not found');
	return new Response(calendar, {
		headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=300' }
	});
};
