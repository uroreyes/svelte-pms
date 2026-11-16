/** App-wide DB singleton. Only adapters (endpoints, hooks) import this — handlers get `ctx.db`. */
import { env } from '$env/dynamic/private';
import { createDb, type DB } from './client';

let instance: DB | undefined;

export function getDb(): DB {
	if (!instance) {
		if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
		instance = createDb(env.DATABASE_URL).db;
	}
	return instance;
}
