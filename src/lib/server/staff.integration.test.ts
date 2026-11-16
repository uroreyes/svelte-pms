/** PR-03 — staff management, sessions revocation, forced password change, escalation guards, against a real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import type { DB } from './db/client';
import { auditEvent, session, staffUser } from './db/schema';
import type { Actor } from './cqrs/actor';
import { executeCommand, executeQuery } from './cqrs/execute';
import { DomainError } from './cqrs/errors';
import type { ErrorCode } from '$lib/shared/cqrs/contract';
import { verifyPassword } from './auth/password';
import { createSession, resolveSession } from './auth/session';
import { addStaff, makeProperty, NOW, openTestDb, TEST_DB_URL, type Fixture } from './testkit';
import { DEFAULT_GRANTS, type PermissionKey } from '$lib/shared/domain/permissions';
import { GetStaff } from '$lib/features/staff/get-staff/contract';
import { getStaff } from '$lib/features/staff/get-staff/handler.server';
import { CreateStaffUser } from '$lib/features/staff/create-staff-user/contract';
import { createStaffUser } from '$lib/features/staff/create-staff-user/handler.server';
import { UpdateStaffUser } from '$lib/features/staff/update-staff-user/contract';
import { updateStaffUser } from '$lib/features/staff/update-staff-user/handler.server';
import { ResetStaffPassword } from '$lib/features/staff/reset-staff-password/contract';
import { resetStaffPassword } from '$lib/features/staff/reset-staff-password/handler.server';
import { ChangeOwnPassword } from '$lib/features/account/change-password/contract';
import { changeOwnPassword } from '$lib/features/account/change-password/handler.server';
import { SavePermissions } from '$lib/features/access/save-permissions/contract';
import { savePermissions } from '$lib/features/access/save-permissions/handler.server';

let db: DB;
let close: () => Promise<void>;
beforeAll(() => {
	if (TEST_DB_URL) ({ db, close } = openTestDb());
});
afterAll(async () => close?.());

const TEMP = 'Temp-Passw0rd!x';
const TEMP2 = 'Other-Passw0rd!y';
const OLD = 'Old-Passw0rd!z1';

const as = (actor: Actor | null) => ({ db, actor, now: NOW });
const create = (actor: Actor, input: Record<string, unknown>) => executeCommand(CreateStaffUser, createStaffUser, input, as(actor));
const update = (actor: Actor, input: Record<string, unknown>) => executeCommand(UpdateStaffUser, updateStaffUser, input, as(actor));
const reset = (actor: Actor, input: Record<string, unknown>) => executeCommand(ResetStaffPassword, resetStaffPassword, input, as(actor));
const change = (actor: Actor, input: Record<string, unknown>) => executeCommand(ChangeOwnPassword, changeOwnPassword, input, as(actor));
const list = (actor: Actor | null) => executeQuery(GetStaff, getStaff, {}, as(actor));
const setGrants = (f: Fixture, role: 'MANAGER' | 'REVENUE_MANAGER' | 'FRONT_DESK' | 'POS', permissions: PermissionKey[]) =>
	executeCommand(SavePermissions, savePermissions, { grants: [{ role, permissions }] }, as(f.admin));

const row = async (id: string) => (await db.select().from(staffUser).where(eq(staffUser.id, id)))[0]!;
const auditCount = async (f: Fixture) => (await db.select({ n: count() }).from(auditEvent).where(eq(auditEvent.propertyId, f.propertyId)))[0]!.n;
const sessionCount = async (userId: string) => (await db.select({ n: count() }).from(session).where(eq(session.userId, userId)))[0]!.n;

async function fail(p: Promise<unknown>): Promise<DomainError> {
	const e = await p.then(() => null, (x: unknown) => x);
	expect(e).toBeInstanceOf(DomainError);
	return e as DomainError;
}

/** Rejects with `code` (+ message fragment); the targets stay byte-identical and no audit row is written. */
async function denied(f: Fixture, targets: string[], p: () => Promise<unknown>, code: ErrorCode, msg?: string) {
	const before = await Promise.all(targets.map(row));
	const auditBefore = await auditCount(f);
	const e = await fail(p());
	expect(e.code).toBe(code);
	if (msg) expect(e.message).toContain(msg);
	expect(await Promise.all(targets.map(row))).toEqual(before);
	expect(await auditCount(f)).toBe(auditBefore);
}

async function sessionOf(userId: string) {
	const { token } = await createSession(db, userId);
	return token;
}

describe.skipIf(!TEST_DB_URL)('staff management (integration)', () => {
	it('1. manager onboards and offboards a front desk user', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const mgr = await addStaff(db, f, { role: 'MANAGER' });
		const email = `fd-${randomUUID().slice(0, 8)}@${f.slug}.test`;
		const ack = await create(mgr, { email: ` ${email.toUpperCase()} `, name: 'Fran Desk', role: 'FRONT_DESK', temporaryPassword: TEMP });
		const created = await row(ack.staffUserId);
		expect(created).toMatchObject({ email, name: 'Fran Desk', role: 'FRONT_DESK', active: true, mustChangePassword: true, isSystem: false, propertyId: f.propertyId });
		expect(await verifyPassword(TEMP, created.passwordHash)).toBe(true);

		const view = await list(mgr);
		expect(view.timezone).toBe('UTC');
		expect(view.users.find((u) => u.staffUserId === ack.staffUserId)).toMatchObject({ email, role: 'FRONT_DESK', mustChangePassword: true, isSelf: false, manageable: true });
		expect(view.assignableRoles).toEqual(['MANAGER', 'REVENUE_MANAGER', 'FRONT_DESK', 'POS']);

		const off = await update(mgr, { staffUserId: ack.staffUserId, active: false });
		expect(off).toEqual({ staffUserId: ack.staffUserId, sessionsRevoked: 0 });
		expect((await row(ack.staffUserId)).active).toBe(false);
		const on = await update(mgr, { staffUserId: ack.staffUserId, active: true });
		expect(on.sessionsRevoked).toBe(0);
		expect((await row(ack.staffUserId)).active).toBe(true);
	});

	it('2. deactivation revokes every session of the target; anonymous callers are rejected', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const fd = await addStaff(db, f, { role: 'FRONT_DESK' });
		const t1 = await sessionOf(fd.userId);
		const t2 = await sessionOf(fd.userId);
		expect(await resolveSession(db, t1)).not.toBeNull();
		expect(await resolveSession(db, t2)).not.toBeNull();

		const ack = await update(f.admin, { staffUserId: fd.userId, active: false });
		expect(ack.sessionsRevoked).toBe(2);
		expect(await sessionCount(fd.userId)).toBe(0);
		expect(await resolveSession(db, t1)).toBeNull();
		expect(await resolveSession(db, t2)).toBeNull();

		expect((await fail(list(null))).code).toBe('UNAUTHENTICATED');
	});

	it('3. admin reset revokes sessions, swaps the password and forces a change', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const pos = await addStaff(db, f, { role: 'POS', password: OLD });
		const t1 = await sessionOf(pos.userId);
		await sessionOf(pos.userId);
		const ack = await reset(f.admin, { staffUserId: pos.userId, temporaryPassword: TEMP });
		expect(ack.sessionsRevoked).toBe(2);
		expect(await sessionCount(pos.userId)).toBe(0);
		expect(await resolveSession(db, t1)).toBeNull();
		const r = await row(pos.userId);
		expect(await verifyPassword(OLD, r.passwordHash)).toBe(false);
		expect(await verifyPassword(TEMP, r.passwordHash)).toBe(true);
		expect(r.mustChangePassword).toBe(true);
	});

	describe('4. own password change', () => {
		it('keeps the current session, revokes the others, clears the flag', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			const u = await addStaff(db, f, { role: 'MANAGER', password: OLD, mustChangePassword: true });
			const tokenA = await sessionOf(u.userId);
			const tokenB = await sessionOf(u.userId);
			const actor = (await resolveSession(db, tokenA))!;
			expect(actor.sessionId).toBeTruthy();
			const ack = await change(actor, { currentPassword: OLD, newPassword: TEMP });
			expect(ack).toEqual({ staffUserId: u.userId, sessionsRevoked: 1 });
			expect(await resolveSession(db, tokenA)).not.toBeNull();
			expect(await resolveSession(db, tokenB)).toBeNull();
			const r = await row(u.userId);
			expect(r.mustChangePassword).toBe(false);
			expect(await verifyPassword(TEMP, r.passwordHash)).toBe(true);
			expect(await verifyPassword(OLD, r.passwordHash)).toBe(false);
		});

		it('rejects wrong current, same, short and repetitive passwords without changes or audit', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			const u = await addStaff(db, f, { role: 'MANAGER', password: OLD });
			await denied(f, [u.userId], () => change(u, { currentPassword: 'wrong-password-1', newPassword: TEMP }), 'VALIDATION', 'Current password is incorrect');
			await denied(f, [u.userId], () => change(u, { currentPassword: OLD, newPassword: OLD }), 'VALIDATION', 'must differ');
			await denied(f, [u.userId], () => change(u, { currentPassword: OLD, newPassword: 'Short-Pw1!!' }), 'VALIDATION');
			await denied(f, [u.userId], () => change(u, { currentPassword: OLD, newPassword: 'aaaaaaaaaaaa' }), 'VALIDATION', 'Choose a less repetitive password');
		});

		it('works for POS with zero grid keys', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			const pos = await addStaff(db, f, { role: 'POS', password: OLD });
			await setGrants(f, 'POS', []);
			const ack = await change(pos, { currentPassword: OLD, newPassword: TEMP });
			expect(ack.staffUserId).toBe(pos.userId);
			expect(await verifyPassword(TEMP, (await row(pos.userId)).passwordHash)).toBe(true);
		});
	});

	describe('5. forced password change gate', () => {
		it('blocks every keyed contract until the password is changed', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			const u = await addStaff(db, f, { role: 'MANAGER', password: OLD, mustChangePassword: true });
			const token = await sessionOf(u.userId);
			const actor = (await resolveSession(db, token))!;
			expect(actor.mustChangePassword).toBe(true);

			const q = await fail(list(actor));
			expect(q.code).toBe('FORBIDDEN');
			expect(q.message).toBe('Password change required');
			const c = await fail(create(actor, { email: `x-${randomUUID().slice(0, 6)}@${f.slug}.test`, name: 'X', role: 'POS', temporaryPassword: TEMP }));
			expect(c.message).toBe('Password change required');

			await change(actor, { currentPassword: OLD, newPassword: TEMP });
			const fresh = (await resolveSession(db, token))!;
			expect(fresh.mustChangePassword).toBe(false);
			expect((await list(fresh)).users.length).toBeGreaterThan(0);
		});
	});

	describe('6. last-admin guard', () => {
		it('self-deactivate / self-demote are rejected; foreign actor cannot remove or demote the only admin', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			const self = 'You cannot change your own role or deactivate yourself';
			await denied(f, [f.admin.userId], () => update(f.admin, { staffUserId: f.admin.userId, active: false }), 'VALIDATION', self);
			await denied(f, [f.admin.userId], () => update(f.admin, { staffUserId: f.admin.userId, role: 'MANAGER' }), 'VALIDATION', self);

			const script: Actor = { ...f.admin, userId: randomUUID() };
			const last = 'The last active Super admin cannot be deactivated or demoted';
			await denied(f, [f.admin.userId], () => update(script, { staffUserId: f.admin.userId, active: false }), 'CONFLICT', last);
			await denied(f, [f.admin.userId], () => update(script, { staffUserId: f.admin.userId, role: 'MANAGER' }), 'CONFLICT', last);

			const admins = await db.select().from(staffUser).where(eq(staffUser.propertyId, f.propertyId));
			expect(admins.filter((u) => u.role === 'ADMIN' && u.active)).toHaveLength(1);
		});
	});

	describe('7. two admins deactivating each other', () => {
		it.each([1, 2, 3, 4, 5])('run %i: exactly one wins, one active admin remains, loser leaves no audit row', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			const a = f.admin;
			const b = await addStaff(db, f, { role: 'ADMIN' });
			const before = await auditCount(f);
			const res = await Promise.allSettled([update(a, { staffUserId: b.userId, active: false }), update(b, { staffUserId: a.userId, active: false })]);
			const ok = res.filter((r) => r.status === 'fulfilled');
			const bad = res.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
			expect(ok).toHaveLength(1);
			expect(bad).toHaveLength(1);
			expect(bad[0]!.reason).toBeInstanceOf(DomainError);
			expect((bad[0]!.reason as DomainError).code).toBe('CONFLICT');
			const users = await db.select().from(staffUser).where(eq(staffUser.propertyId, f.propertyId));
			expect(users.filter((u) => u.role === 'ADMIN' && u.active)).toHaveLength(1);
			expect(await auditCount(f)).toBe(before + 1);
		});
	});

	describe('8. escalation', () => {
		it('manager cannot create, promote to, deactivate or reset a Super admin', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			const mgr = await addStaff(db, f, { role: 'MANAGER' });
			const fd = await addStaff(db, f, { role: 'FRONT_DESK' });
			const adm2 = await addStaff(db, f, { role: 'ADMIN' });
			expect((await list(mgr)).users.find((u) => u.staffUserId === adm2.userId)!.manageable).toBe(false);
			const msg = 'You cannot manage Super admin users';
			const email = `new-${randomUUID().slice(0, 6)}@${f.slug}.test`;
			await denied(f, [fd.userId, adm2.userId], () => create(mgr, { email, name: 'New', role: 'ADMIN', temporaryPassword: TEMP }), 'FORBIDDEN', msg);
			expect(await db.select().from(staffUser).where(eq(staffUser.email, email))).toHaveLength(0);
			await denied(f, [fd.userId], () => update(mgr, { staffUserId: fd.userId, role: 'ADMIN' }), 'FORBIDDEN', msg);
			await denied(f, [adm2.userId], () => update(mgr, { staffUserId: adm2.userId, active: false }), 'FORBIDDEN', msg);
			await denied(f, [adm2.userId], () => reset(mgr, { staffUserId: adm2.userId, temporaryPassword: TEMP }), 'FORBIDDEN', msg);
		});

		it('(a) name-only update of an admin is forbidden', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			const mgr = await addStaff(db, f, { role: 'MANAGER' });
			await denied(f, [f.admin.userId], () => update(mgr, { staffUserId: f.admin.userId, name: 'Hacked' }), 'FORBIDDEN', 'You cannot manage Super admin users');
		});

		it('(b) reactivating an inactive admin is forbidden', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			const mgr = await addStaff(db, f, { role: 'MANAGER' });
			const off = await addStaff(db, f, { role: 'ADMIN', active: false });
			await denied(f, [off.userId], () => update(mgr, { staffUserId: off.userId, active: true }), 'FORBIDDEN', 'You cannot manage Super admin users');
		});

		it('(c) only the requested new role exceeds the actor', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			await setGrants(f, 'FRONT_DESK', [...DEFAULT_GRANTS.FRONT_DESK, 'setup.manage', 'staff.manage']);
			const fd = await addStaff(db, f, { role: 'FRONT_DESK' });
			const email = `p-${randomUUID().slice(0, 6)}@${f.slug}.test`;
			const ack = await create(fd, { email, name: 'Pat Pos', role: 'POS', temporaryPassword: TEMP });
			expect((await row(ack.staffUserId)).role).toBe('POS');

			const msg = 'You cannot manage Manager users';
			await denied(f, [ack.staffUserId], () => update(fd, { staffUserId: ack.staffUserId, role: 'MANAGER' }), 'FORBIDDEN', msg);
			const email2 = `m-${randomUUID().slice(0, 6)}@${f.slug}.test`;
			await denied(f, [fd.userId], () => create(fd, { email: email2, name: 'Mia', role: 'MANAGER', temporaryPassword: TEMP }), 'FORBIDDEN', msg);
			expect(await db.select().from(staffUser).where(eq(staffUser.email, email2))).toHaveLength(0);
		});

		it('(d) grid drift: a role that outgrew the actor can no longer be managed', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			const mgr = await addStaff(db, f, { role: 'MANAGER' });
			const rev = await addStaff(db, f, { role: 'REVENUE_MANAGER' });
			expect((await list(mgr)).users.find((u) => u.staffUserId === rev.userId)!.manageable).toBe(true);

			await setGrants(f, 'MANAGER', DEFAULT_GRANTS.MANAGER.filter((k) => k !== 'insights.view'));
			const msg = 'You cannot manage Revenue manager users';
			await denied(f, [rev.userId], () => update(mgr, { staffUserId: rev.userId, name: 'Renamed' }), 'FORBIDDEN', msg);
			await denied(f, [rev.userId], () => update(mgr, { staffUserId: rev.userId, active: false }), 'FORBIDDEN', msg);
			await denied(f, [rev.userId], () => reset(mgr, { staffUserId: rev.userId, temporaryPassword: TEMP }), 'FORBIDDEN', msg);

			const view = await list(mgr);
			expect(view.users.find((u) => u.staffUserId === rev.userId)!.manageable).toBe(false);
			expect(view.assignableRoles).not.toContain('REVENUE_MANAGER');
		});

		it('(e) self rename, same-role and active:true are allowed', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			const mgr = await addStaff(db, f, { role: 'MANAGER' });
			await update(mgr, { staffUserId: mgr.userId, role: 'MANAGER' });
			await update(mgr, { staffUserId: mgr.userId, active: true });
			await update(mgr, { staffUserId: mgr.userId, name: 'Renamed Self' });
			const r = await row(mgr.userId);
			expect(r).toMatchObject({ role: 'MANAGER', active: true, name: 'Renamed Self' });
		});
	});

	it('9. admin reset on self is rejected', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		await denied(f, [f.admin.userId], () => reset(f.admin, { staffUserId: f.admin.userId, temporaryPassword: TEMP }), 'VALIDATION', 'Use "Change password" to change your own password');
	});

	describe('10. tenant, system user and CHECK constraints', () => {
		it('other property admin gets NOT_FOUND and the list is tenant-scoped', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			const g = await makeProperty(db, [['Std', 10000, 1]]);
			const fd = await addStaff(db, f, { role: 'FRONT_DESK' });
			await denied(f, [fd.userId], () => update(g.admin, { staffUserId: fd.userId, active: false }), 'NOT_FOUND');
			await denied(f, [fd.userId], () => reset(g.admin, { staffUserId: fd.userId, temporaryPassword: TEMP }), 'NOT_FOUND');
			const emails = (await list(g.admin)).users.map((u) => u.email);
			expect(emails).toEqual([g.admin.email]);
		});

		it('system user is hidden and untouchable', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			const sys = await addStaff(db, f, { role: 'MANAGER', isSystem: true, active: false });
			expect((await list(f.admin)).users.map((u) => u.staffUserId)).not.toContain(sys.userId);
			await denied(f, [sys.userId], () => update(f.admin, { staffUserId: sys.userId, active: true }), 'NOT_FOUND');
			await denied(f, [sys.userId], () => reset(f.admin, { staffUserId: sys.userId, temporaryPassword: TEMP }), 'NOT_FOUND');
		});

		it('database rejects an active system user and an upper-case email (23514)', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			const code = async (values: Partial<typeof staffUser.$inferInsert>) => {
				const e = (await db
					.insert(staffUser)
					.values({ propertyId: f.propertyId, email: `c-${randomUUID().slice(0, 8)}@${f.slug}.test`, name: 'C', role: 'POS', passwordHash: 'x', ...values })
					.then(() => null, (x: unknown) => x)) as { code?: string; cause?: { code?: string } } | null;
				expect(e).not.toBeNull();
				return e!.code ?? e!.cause?.code;
			};
			expect(await code({ isSystem: true, active: true })).toBe('23514');
			expect(await code({ email: `UPPER-${randomUUID().slice(0, 8)}@${f.slug}.test` })).toBe('23514');
		});
	});

	it('11. duplicate email is global, case-insensitive and does not leak the other property', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const g = await makeProperty(db, [['Std', 10000, 1]]);
		for (const email of [g.admin.email, g.admin.email.toUpperCase()]) {
			const e = await fail(create(f.admin, { email, name: 'Dup', role: 'POS', temporaryPassword: TEMP }));
			expect(e.code).toBe('CONFLICT');
			expect(e.message).toBe('A user with this email already exists');
			expect(e.message).not.toContain(g.slug);
		}
		expect(await auditCount(f)).toBe(0);
	});

	it('12. role change does not revoke sessions', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const fd = await addStaff(db, f, { role: 'FRONT_DESK' });
		const token = await sessionOf(fd.userId);
		const ack = await update(f.admin, { staffUserId: fd.userId, role: 'MANAGER' });
		expect(ack.sessionsRevoked).toBe(0);
		expect(await sessionCount(fd.userId)).toBe(1);
		const actor = (await resolveSession(db, token))!;
		expect(actor.role).toBe('MANAGER');
		expect((await list(actor)).users.length).toBeGreaterThan(0);
	});

	it('13. audit: one labelled row per command, passwords and hashes never stored', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const u = await addStaff(db, f, { role: 'MANAGER', password: OLD });
		const email = `a-${randomUUID().slice(0, 6)}@${f.slug}.test`;
		const made = await create(f.admin, { email, name: 'Audit Me', role: 'POS', temporaryPassword: TEMP });
		await update(f.admin, { staffUserId: made.staffUserId, name: 'Audit Renamed' });
		await reset(f.admin, { staffUserId: made.staffUserId, temporaryPassword: TEMP2 });
		await change(u, { currentPassword: OLD, newPassword: 'Brand-New-Pw9!q' });

		const rows = await db.select().from(auditEvent).where(eq(auditEvent.propertyId, f.propertyId));
		expect(rows.map((r) => r.command).sort()).toEqual(['account.changePassword', 'staff.create', 'staff.resetPassword', 'staff.update']);
		for (const r of rows) {
			expect(r.entityType).toBe('staffUser');
			expect(r.entityId).toBeTruthy();
		}
		const by = (c: string) => rows.find((r) => r.command === c)!.input as Record<string, unknown>;
		expect(by('staff.create').temporaryPassword).toBe('[redacted]');
		expect(by('staff.resetPassword').temporaryPassword).toBe('[redacted]');
		expect(by('account.changePassword').currentPassword).toBe('[redacted]');
		expect(by('account.changePassword').newPassword).toBe('[redacted]');
		expect(by('staff.create').email).toBe('[redacted]');

		const blob = JSON.stringify(rows);
		for (const secret of [TEMP, TEMP2, OLD, 'Brand-New-Pw9!q', 'scrypt$']) expect(blob).not.toContain(secret);
		for (const u of await db.select({ h: staffUser.passwordHash }).from(staffUser).where(eq(staffUser.propertyId, f.propertyId))) {
			expect(blob).not.toContain(u.h);
		}
	});

	// 14 is the one documented exception to executor-only tests: the handlers are called inside db.transaction with a
	// hand-built ctx whose `permissions` is the STALE set (still containing staff.manage), simulating the window between
	// authorize() and the property lock in which a grid save lands. Only the fresh re-load under the lock can reject.
	describe('14. stale ctx.permissions (direct handler calls)', () => {
		it('create / update / reset re-check permissions under the lock', async () => {
			const f = await makeProperty(db, [['Std', 10000, 1]]);
			const mgr = await addStaff(db, f, { role: 'MANAGER' });
			const pos = await addStaff(db, f, { role: 'POS', password: OLD });
			await sessionOf(pos.userId);
			await setGrants(f, 'MANAGER', DEFAULT_GRANTS.MANAGER.filter((k) => k !== 'staff.manage'));
			const stale = new Set<PermissionKey>(DEFAULT_GRANTS.MANAGER);
			const ctx = (tx: Parameters<Parameters<DB['transaction']>[0]>[0]) => ({ db: tx, actor: mgr, permissions: stale, now: NOW });

			const before = await row(pos.userId);
			const email = `s-${randomUUID().slice(0, 6)}@${f.slug}.test`;
			const auditBefore = await auditCount(f);

			const c = await fail(db.transaction((tx) => createStaffUser({ email, name: 'Stale', role: 'POS', temporaryPassword: TEMP }, ctx(tx))));
			const u = await fail(db.transaction((tx) => updateStaffUser({ staffUserId: pos.userId, active: false }, ctx(tx))));
			const r = await fail(db.transaction((tx) => resetStaffPassword({ staffUserId: pos.userId, temporaryPassword: TEMP }, ctx(tx))));
			for (const e of [c, u, r]) expect(e.code).toBe('FORBIDDEN');

			expect(await db.select().from(staffUser).where(eq(staffUser.email, email))).toHaveLength(0);
			expect(await row(pos.userId)).toEqual(before);
			expect(await sessionCount(pos.userId)).toBe(1);
			expect(await auditCount(f)).toBe(auditBefore);
			// same outcome through the executor (fresh authorize)
			expect((await fail(update(mgr, { staffUserId: pos.userId, active: false }))).code).toBe('FORBIDDEN');
		});
	});
});

