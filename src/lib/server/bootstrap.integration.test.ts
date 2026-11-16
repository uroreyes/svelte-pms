/** PR-02 — first-install bootstrap, against a real Postgres. The shared test DB always has other tenants. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DB } from './db/client';
import { auditEvent, property, staffUser } from './db/schema';
import { makeProperty, NOW, openTestDb, TEST_DB_URL } from './testkit';
import { verifyPassword } from './auth/password';
import { PG, pgConstraintName, pgErrorCode } from './db/pg-errors';
import { BOOTSTRAP_COMMAND, BootstrapRefused, bootstrapProperty, runBootstrap, systemUserEmail } from './maintenance/bootstrap';
import type { BootstrapArgs } from './maintenance/bootstrap-args';
import { AUDIT_LABELS } from '$lib/shared/domain/audit-labels';

let db: DB;
let close: () => Promise<void>;
beforeAll(() => {
	if (TEST_DB_URL) ({ db, close } = openTestDb());
});
afterAll(async () => close?.());

const PASSWORD = 'Sup3r-Secret-Pw-XYZ';
const uid = () => randomUUID().slice(0, 12);
const mkArgs = (over: Partial<BootstrapArgs> = {}): BootstrapArgs => {
	const id = uid();
	return {
		propertyName: `Bootstrap ${id}`,
		slug: `b-${id}`,
		adminEmail: `admin-${id}@boot.test`,
		adminName: 'Ada Admin',
		timezone: 'Europe/Paris',
		currency: 'EUR',
		allowExistingProperties: true,
		...over
	};
};
const refusal = async (p: Promise<unknown>): Promise<BootstrapRefused> => {
	const e = await p.then(() => null, (x: unknown) => x);
	expect(e).toBeInstanceOf(BootstrapRefused);
	return e as BootstrapRefused;
};
const run = (args: BootstrapArgs, generatePassword = () => PASSWORD) => {
	const out: string[] = [];
	const err: string[] = [];
	return runBootstrap(db, args, { now: NOW, generatePassword, log: (l) => out.push(l), error: (l) => err.push(l) }).then((code) => ({ code, out, err }));
};

/** F5: a refused attempt leaves no property, no admin/system user and no bootstrap audit row for the slug. */
async function assertNothingCreated(slug: string, adminEmail: string, opts: { except?: string[] } = {}) {
	expect(await db.select({ id: property.id }).from(property).where(eq(property.slug, slug))).toHaveLength(0);
	const emails = [adminEmail, systemUserEmail(slug)].filter((e) => !(opts.except ?? []).includes(e));
	expect(await db.select({ id: staffUser.id }).from(staffUser).where(inArray(staffUser.email, emails))).toHaveLength(0);
	const audit = await db
		.select({ id: auditEvent.id })
		.from(auditEvent)
		.where(and(eq(auditEvent.command, BOOTSTRAP_COMMAND), sql`${auditEvent.input}->>'propertySlug' = ${slug}`));
	expect(audit).toHaveLength(0);
}

describe.skipIf(!TEST_DB_URL)('bootstrap (integration)', () => {
	it('creates exactly one property, one admin and one inactive system user', async () => {
		const args = mkArgs({ adminEmail: `Mixed-${uid()}@Boot.Test`.toLowerCase() });
		const { code, err } = await run(args);
		expect(code).toBe(0);
		expect(err).toEqual([]);

		const props = await db.select().from(property).where(eq(property.slug, args.slug));
		expect(props).toHaveLength(1);
		expect(props[0]).toMatchObject({ name: args.propertyName, timezone: 'Europe/Paris', currency: 'EUR' });
		const users = await db.select().from(staffUser).where(eq(staffUser.propertyId, props[0]!.id));
		expect(users).toHaveLength(2);
		const admin = users.find((u) => !u.isSystem)!;
		expect(admin).toMatchObject({ email: args.adminEmail, role: 'ADMIN', active: true, mustChangePassword: true, name: 'Ada Admin' });
		const system = users.find((u) => u.isSystem)!;
		expect(system).toMatchObject({ email: `night-audit@${args.slug}.system`, role: 'MANAGER', active: false, isSystem: true });
	});

	it('prints the one-time password once, never to the error stream, and it verifies against the stored hash', async () => {
		const args = mkArgs();
		const { code, out, err } = await run(args);
		expect(code).toBe(0);
		expect(out.filter((l) => l.includes(PASSWORD))).toHaveLength(1);
		expect(err.some((l) => l.includes(PASSWORD))).toBe(false);
		const [admin] = await db.select().from(staffUser).where(eq(staffUser.email, args.adminEmail));
		expect(await verifyPassword(PASSWORD, admin!.passwordHash)).toBe(true);
		expect(admin!.passwordHash).not.toContain(PASSWORD);
	});

	it('writes one audit row attributed to the new admin, without email or password', async () => {
		const args = mkArgs();
		await run(args);
		const [prop] = await db.select().from(property).where(eq(property.slug, args.slug));
		const [admin] = await db.select().from(staffUser).where(eq(staffUser.email, args.adminEmail));
		const rows = await db.select().from(auditEvent).where(eq(auditEvent.propertyId, prop!.id));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ command: BOOTSTRAP_COMMAND, actorUserId: admin!.id });
		const input = rows[0]!.input as Record<string, unknown>;
		expect(input).toEqual({ propertySlug: args.slug, propertyName: args.propertyName, currency: 'EUR', timezone: 'Europe/Paris' });
		expect(input).not.toHaveProperty('email');
		expect(input).not.toHaveProperty('adminEmail');
		const dump = JSON.stringify(rows[0]);
		expect(dump).not.toContain(PASSWORD);
		expect(dump).not.toContain(args.adminEmail);
		expect(AUDIT_LABELS[BOOTSTRAP_COMMAND]).toBe('Property created (bootstrap)');
	});

	it('refuses with PROPERTY_EXISTS when other properties exist and the opt-out is off', async () => {
		await makeProperty(db, [['Std', 10000, 1]]);
		const args = mkArgs({ allowExistingProperties: false });
		const e = await refusal(bootstrapProperty(db, args, { password: PASSWORD, now: NOW }));
		expect(e.code).toBe('PROPERTY_EXISTS');
		await assertNothingCreated(args.slug, args.adminEmail);

		const { code, out, err } = await run(args);
		expect(code).toBe(1);
		expect(out).toEqual([]);
		expect(err).toHaveLength(1);
		expect(err[0]).not.toContain(PASSWORD);
		await assertNothingCreated(args.slug, args.adminEmail);
	});

	it('refuses a taken property slug and leaves the first property untouched', async () => {
		const first = mkArgs();
		expect((await run(first)).code).toBe(0);
		const second = mkArgs({ slug: first.slug });
		const e = await refusal(bootstrapProperty(db, second, { password: PASSWORD, now: NOW }));
		expect(e.code).toBe('SLUG_TAKEN');
		expect(e.message).toBe(`Property slug "${first.slug}" already exists`);
		expect(await db.select({ id: property.id }).from(property).where(eq(property.slug, first.slug))).toHaveLength(1);
		expect(await db.select({ id: staffUser.id }).from(staffUser).where(eq(staffUser.email, second.adminEmail))).toHaveLength(0);
		const audit = await db.select({ id: auditEvent.id }).from(auditEvent).where(and(eq(auditEvent.command, BOOTSTRAP_COMMAND), sql`${auditEvent.input}->>'propertySlug' = ${first.slug}`));
		expect(audit).toHaveLength(1);
	});

	it('refuses SLUG_TAKEN when the night-audit system email already exists', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const args = mkArgs();
		const sysEmail = systemUserEmail(args.slug);
		await db.insert(staffUser).values({ propertyId: f.propertyId, email: sysEmail, name: 'Sys', role: 'MANAGER', passwordHash: 'x', active: false, isSystem: true });
		const e = await refusal(bootstrapProperty(db, args, { password: PASSWORD, now: NOW }));
		expect(e.code).toBe('SLUG_TAKEN');
		expect(e.message).toBe(`Night-audit user for slug "${args.slug}" already exists`);
		await assertNothingCreated(args.slug, args.adminEmail, { except: [sysEmail] });
		const pre = await db.select().from(staffUser).where(eq(staffUser.email, sysEmail));
		expect(pre).toHaveLength(1);
		expect(pre[0]!.propertyId).toBe(f.propertyId);
	});

	it('refuses EMAIL_TAKEN for an existing admin email and rolls everything back', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const args = mkArgs({ adminEmail: f.admin.email! });
		const e = await refusal(bootstrapProperty(db, args, { password: PASSWORD, now: NOW }));
		expect(e.code).toBe('EMAIL_TAKEN');
		await assertNothingCreated(args.slug, args.adminEmail, { except: [args.adminEmail] });
		expect(await db.select({ id: staffUser.id }).from(staffUser).where(eq(staffUser.email, args.adminEmail))).toHaveLength(1);
	});

	it('race: two bootstraps of the same slug produce exactly one winner', async () => {
		const slug = `b-${uid()}`;
		const a = mkArgs({ slug });
		const b = mkArgs({ slug });
		const results = await Promise.allSettled([a, b].map((x) => bootstrapProperty(db, x, { password: PASSWORD, now: NOW })));
		const ok = results.filter((r) => r.status === 'fulfilled');
		const bad = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
		expect(ok).toHaveLength(1);
		expect(bad).toHaveLength(1);
		expect(bad[0]!.reason).toBeInstanceOf(BootstrapRefused);
		expect((bad[0]!.reason as BootstrapRefused).code).toBe('SLUG_TAKEN');
		expect(await db.select({ id: property.id }).from(property).where(eq(property.slug, slug))).toHaveLength(1);
	});

	it('race: bootstrap vs direct staff insert of the same email, one winner and no orphan property', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		let bootstrapWon = 0;
		let insertWon = 0;
		for (let i = 0; i < 6; i++) {
			const args = mkArgs();
			const insert = Promise.resolve().then(() =>
				db.insert(staffUser).values({ propertyId: f.propertyId, email: args.adminEmail, name: 'Racer', role: 'FRONT_DESK', passwordHash: 'x' })
			);
			const boot = bootstrapProperty(db, args, { password: PASSWORD, now: NOW });
			const [first, second] = i % 2 === 0 ? await Promise.allSettled([boot, insert]) : (await Promise.allSettled([insert, boot])).reverse();
			const [bootRes, insRes] = [first!, second!];
			expect([bootRes.status, insRes.status].filter((s) => s === 'fulfilled')).toHaveLength(1);
			const users = await db.select().from(staffUser).where(eq(staffUser.email, args.adminEmail));
			expect(users).toHaveLength(1);
			if (bootRes.status === 'fulfilled') {
				bootstrapWon++;
				expect(insRes.status).toBe('rejected');
				expect(pgErrorCode((insRes as PromiseRejectedResult).reason)).toBe(PG.UNIQUE_VIOLATION);
				expect(await db.select({ id: property.id }).from(property).where(eq(property.slug, args.slug))).toHaveLength(1);
			} else {
				insertWon++;
				expect(bootRes.reason).toBeInstanceOf(BootstrapRefused);
				expect((bootRes.reason as BootstrapRefused).code).toBe('EMAIL_TAKEN');
				await assertNothingCreated(args.slug, args.adminEmail, { except: [args.adminEmail] });
				expect(users[0]!.propertyId).toBe(f.propertyId);
			}
		}
		expect(bootstrapWon + insertWon).toBe(6);
	});

	it('pgConstraintName reads the constraint of a Drizzle-wrapped unique violation', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const dup = await db.insert(staffUser).values({ propertyId: f.propertyId, email: f.admin.email!, name: 'Dup', role: 'ADMIN', passwordHash: 'x' }).then(() => null, (x: unknown) => x);
		expect(pgErrorCode(dup)).toBe(PG.UNIQUE_VIOLATION);
		expect(pgConstraintName(dup)).toBe('staff_user_email_unique');
		expect(pgConstraintName(new Error('plain'))).toBeUndefined();
	});

	it('creates a system user that the night-audit lookup (propertyId + isSystem) finds', async () => {
		const args = mkArgs();
		const { code } = await run(args);
		expect(code).toBe(0);
		const [p] = await db.select().from(property).where(eq(property.slug, args.slug));
		const found = await db.select().from(staffUser).where(and(eq(staffUser.propertyId, p!.id), eq(staffUser.isSystem, true)));
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({ email: systemUserEmail(args.slug), active: false });
	});
});
