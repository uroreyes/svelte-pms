/**
 * First-install bootstrap: one property, its admin (must change password) and the inactive night-audit
 * system user. No demo data. The one-time password goes to deps.log only — never to error(), audit or exceptions.
 */
import { randomBytes } from 'node:crypto';
import { count, eq, sql } from 'drizzle-orm';
import type { DB } from '$lib/server/db/client';
import { property, staffUser } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/auth/password';
import { recordAudit } from '$lib/server/audit/record';
import { PG, pgConstraintName, pgErrorCode } from '$lib/server/db/pg-errors';
import { tempPasswordFromBytes } from '$lib/shared/domain/staff';
import type { BootstrapArgs } from './bootstrap-args';
import { errorSummary } from './error-summary';

export const BOOTSTRAP_COMMAND = 'ops.bootstrapProperty';
export const systemUserEmail = (slug: string): string => `night-audit@${slug}.system`;

export type BootstrapRefusalCode = 'PROPERTY_EXISTS' | 'SLUG_TAKEN' | 'EMAIL_TAKEN';

export class BootstrapRefused extends Error {
	constructor(
		readonly code: BootstrapRefusalCode,
		message: string
	) {
		super(message);
		this.name = 'BootstrapRefused';
	}
}

export interface BootstrapResult {
	propertyId: string;
	adminUserId: string;
	systemUserId: string;
}

const slugTaken = (slug: string) => new BootstrapRefused('SLUG_TAKEN', `Property slug "${slug}" already exists`);
const systemTaken = (slug: string) => new BootstrapRefused('SLUG_TAKEN', `Night-audit user for slug "${slug}" already exists`);
const emailTaken = (email: string) => new BootstrapRefused('EMAIL_TAKEN', `Email ${email} is already in use`);

const emailExists = async (db: Pick<DB, 'select'>, email: string): Promise<boolean> =>
	(await db.select({ id: staffUser.id }).from(staffUser).where(eq(staffUser.email, email)).limit(1)).length > 0;

/** One transaction. Password hashing happens before the tx (scrypt is slow; keep lock time short). */
export async function bootstrapProperty(db: DB, args: BootstrapArgs, opts: { password: string; now: Date }): Promise<BootstrapResult> {
	const passwordHash = await hashPassword(opts.password);
	const systemHash = await hashPassword(randomBytes(32).toString('hex'));
	const sysEmail = systemUserEmail(args.slug);
	try {
		return await db.transaction(async (tx) => {
			await tx.execute(sql`SET LOCAL lock_timeout = '10s'`);
			// Serialises bootstrap vs bootstrap and any other property INSERT. Does not block staff_user inserts,
			// so the email race is guarded by the unique constraint (classified in the catch below).
			await tx.execute(sql`LOCK TABLE property IN SHARE ROW EXCLUSIVE MODE`);

			const [sameSlug] = await tx.select({ id: property.id }).from(property).where(eq(property.slug, args.slug)).limit(1);
			if (sameSlug) throw slugTaken(args.slug);
			const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(property);
			if (n > 0 && !args.allowExistingProperties) {
				throw new BootstrapRefused(
					'PROPERTY_EXISTS',
					`This database already has ${n} property(ies) — bootstrap is for a fresh install (pass --allow-existing-properties to add another)`
				);
			}
			if (await emailExists(tx, args.adminEmail)) throw emailTaken(args.adminEmail);
			if (await emailExists(tx, sysEmail)) throw systemTaken(args.slug);

			const [prop] = await tx
				.insert(property)
				.values({ slug: args.slug, name: args.propertyName, currency: args.currency, timezone: args.timezone })
				.returning({ id: property.id });
			const [admin] = await tx
				.insert(staffUser)
				.values({
					propertyId: prop!.id,
					email: args.adminEmail,
					name: args.adminName,
					role: 'ADMIN',
					passwordHash,
					active: true,
					mustChangePassword: true
				})
				.returning({ id: staffUser.id });
			const [system] = await tx
				.insert(staffUser)
				.values({
					propertyId: prop!.id,
					email: sysEmail,
					name: 'Night audit (system)',
					role: 'MANAGER',
					active: false,
					isSystem: true,
					passwordHash: systemHash
				})
				.returning({ id: staffUser.id });

			await recordAudit(tx, {
				command: BOOTSTRAP_COMMAND,
				actor: {
					userId: admin!.id,
					propertyId: prop!.id,
					role: 'ADMIN',
					name: args.adminName,
					email: args.adminEmail,
					mustChangePassword: true
				},
				input: { propertySlug: args.slug, propertyName: args.propertyName, currency: args.currency, timezone: args.timezone },
				result: { propertyId: prop!.id, staffUserId: admin!.id },
				now: opts.now
			});
			return { propertyId: prop!.id, adminUserId: admin!.id, systemUserId: system!.id };
		});
	} catch (e) {
		if (e instanceof BootstrapRefused) throw e;
		if (pgErrorCode(e) === PG.UNIQUE_VIOLATION) {
			const constraint = pgConstraintName(e);
			if (constraint === 'property_slug_unique') throw slugTaken(args.slug);
			if (constraint === 'staff_user_email_unique') {
				throw (await emailExists(db, sysEmail)) ? systemTaken(args.slug) : emailTaken(args.adminEmail);
			}
		}
		throw e;
	}
}

/** CLI body. Exit codes: 0 created · 1 refused or fatal (nothing created). */
export async function runBootstrap(
	db: DB,
	args: BootstrapArgs,
	deps: {
		now: Date;
		generatePassword?: () => string;
		log: (line: string) => void;
		error: (line: string) => void;
	}
): Promise<number> {
	const password = (deps.generatePassword ?? (() => tempPasswordFromBytes(crypto.getRandomValues(new Uint8Array(64)))))();
	try {
		await bootstrapProperty(db, args, { password, now: deps.now });
	} catch (e) {
		deps.error(e instanceof BootstrapRefused ? e.message : `Bootstrap failed: ${errorSummary(e)}`);
		return 1;
	}
	deps.log(`Created property "${args.propertyName}" (${args.slug}) · timezone ${args.timezone} · currency ${args.currency}`);
	deps.log(`Admin: ${args.adminEmail}`);
	deps.log(`One-time password: ${password}`);
	deps.log('Store it now — it is not shown again. It must be changed at first sign-in.');
	deps.log(`Public booking page: /book/${args.slug} (add rooms and rates in Setup first)`);
	return 0;
}
