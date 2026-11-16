import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type DB = PostgresJsDatabase<typeof schema>;
/** A transaction handle — every command handler receives one of these. */
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export function createDb(url: string, options: { max?: number } = {}): { db: DB; close: () => Promise<void> } {
	const client = postgres(url, { max: options.max ?? 10, onnotice: () => {} });
	return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
}

/** Anything that can run queries: the root DB or a transaction. */
export type Executor = import('drizzle-orm/pg-core').PgDatabase<import('drizzle-orm/postgres-js').PostgresJsQueryResultHKT, typeof schema>;
