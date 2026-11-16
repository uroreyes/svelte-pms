/**
 * Runtime migrator (no drizzle-kit needed): applies ./drizzle SQL migrations.
 * Shares drizzle-kit's bookkeeping table, so either tool can be used against the same DB.
 *   DATABASE_URL=… MIGRATIONS_DIR=./drizzle node migrate.mjs
 */
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from '$lib/server/db/client';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const { db, close } = createDb(url, { max: 1 });

migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? 'drizzle' })
	.then(() => console.log('Migrations applied.'))
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(close);
