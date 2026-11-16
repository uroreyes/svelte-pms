import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

/** Liveness + DB reachability for Docker/nginx health checks. */
export const GET: RequestHandler = async () => {
	try {
		await getDb().execute(sql`select 1`);
		return json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
	} catch {
		return json({ ok: false }, { status: 503, headers: { 'cache-control': 'no-store' } });
	}
};
