/** RBAC — permission grid, executor enforcement, locks, audit and races, against a real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { DB } from './db/client';
import { auditEvent, rolePermission } from './db/schema';
import { executeCommand, executeQuery } from './cqrs/execute';
import { DomainError } from './cqrs/errors';
import { guest, makeProperty, NOW, openTestDb, TEST_DB_URL, TEST_PII_KEYRING, TODAY, type Fixture } from './testkit';
import { addDays } from '$lib/shared/domain/dates';
import type { StaffRole } from '$lib/shared/domain/enums';
import { auditLabel } from '$lib/shared/domain/audit-labels';
import { loadPermissions } from './domain/permissions';
import { DEFAULT_GRANTS, PERMISSION_KEYS, overridesFor, toggleGrant, type EditableRole, type PermissionKey } from '$lib/shared/domain/permissions';
import { GetPermissions } from '$lib/features/access/get-permissions/contract';
import { getPermissions } from '$lib/features/access/get-permissions/handler.server';
import { SavePermissions } from '$lib/features/access/save-permissions/contract';
import { savePermissions } from '$lib/features/access/save-permissions/handler.server';
import { SearchReservations } from '$lib/features/reservations/search-reservations/contract';
import { searchReservations } from '$lib/features/reservations/search-reservations/handler.server';
import { GetCashierReport } from '$lib/features/reports/get-cashier-report/contract';
import { getCashierReport } from '$lib/features/reports/get-cashier-report/handler.server';
import { ExportDataset } from '$lib/features/reports/export-dataset/contract';
import { exportDataset } from '$lib/features/reports/export-dataset/handler.server';
import { GetInventoryGrid } from '$lib/features/inventory/get-inventory-grid/contract';
import { getInventoryGrid } from '$lib/features/inventory/get-inventory-grid/handler.server';
import { GetDashboard } from '$lib/features/insights/get-dashboard/contract';
import { getDashboard } from '$lib/features/insights/get-dashboard/handler.server';
import { GetPosCatalog } from '$lib/features/folio/get-pos-catalog/contract';
import { getPosCatalog } from '$lib/features/folio/get-pos-catalog/handler.server';
import { SetDailyInventory } from '$lib/features/inventory/set-daily-inventory/contract';
import { setDailyInventory } from '$lib/features/inventory/set-daily-inventory/handler.server';
import { BulkUpdateInventory } from '$lib/features/inventory/bulk-update-inventory/contract';
import { bulkUpdateInventory } from '$lib/features/inventory/bulk-update-inventory/handler.server';
import { GetChannels } from '$lib/features/channels/get-channels/contract';
import { getChannels } from '$lib/features/channels/get-channels/handler.server';
import { UpsertChannelMapping } from '$lib/features/channels/upsert-mapping/contract';
import { upsertChannelMapping } from '$lib/features/channels/upsert-mapping/handler.server';
import { CreateReservation } from '$lib/features/reservations/create-reservation/contract';
import { createFrontDeskReservation } from '$lib/features/reservations/create-reservation/handler.server';
import { GetFolioLedger } from '$lib/features/folio/get-folio-ledger/contract';
import { getFolioLedger } from '$lib/features/folio/get-folio-ledger/handler.server';
import { GetSetup } from '$lib/features/setup/get-setup/contract';
import { getSetup } from '$lib/features/setup/get-setup/handler.server';
import { CheckIn } from '$lib/features/front-desk/check-in/contract';
import { makeCheckIn } from '$lib/features/front-desk/check-in/handler.server';
import { PostCharge } from '$lib/features/folio/post-charge/contract';
import { postCharge } from '$lib/features/folio/post-charge/handler.server';
import { GetAuditLog } from '$lib/features/audit/get-audit-log/contract';
import { getAuditLog } from '$lib/features/audit/get-audit-log/handler.server';
import { GetStaff } from '$lib/features/staff/get-staff/contract';
import { getStaff } from '$lib/features/staff/get-staff/handler.server';

const checkIn = makeCheckIn(() => TEST_PII_KEYRING);

let db: DB;
let close: () => Promise<void>;
beforeAll(() => {
	if (TEST_DB_URL) ({ db, close } = openTestDb());
});
afterAll(async () => close?.());

const as = (f: Fixture, role: StaffRole) => ({ db, actor: { ...f.admin, role }, now: NOW });
const admin = (f: Fixture) => as(f, 'ADMIN');

/** Resolves to 'OK' or the DomainError code. */
async function outcome(p: Promise<unknown>): Promise<string> {
	const e = await p.then(() => null, (x: unknown) => x);
	if (e === null) return 'OK';
	expect(e).toBeInstanceOf(DomainError);
	return (e as DomainError).code;
}
async function failure(p: Promise<unknown>): Promise<DomainError> {
	const e = await p.then(() => null, (x: unknown) => x);
	expect(e).toBeInstanceOf(DomainError);
	return e as DomainError;
}
const save = (f: Fixture, grants: { role: EditableRole; permissions: readonly PermissionKey[] }[]) =>
	executeCommand(SavePermissions, savePermissions, { grants }, admin(f));
const rows = (f: Fixture, role: StaffRole) =>
	db.select().from(rolePermission).where(and(eq(rolePermission.propertyId, f.propertyId), eq(rolePermission.role, role)));

// Probes: one call per contract; inputs are valid so 'OK' proves the whole path, FORBIDDEN proves the gate.
const probe = {
	search: (f: Fixture, r: StaffRole) => outcome(executeQuery(SearchReservations, searchReservations, {}, as(f, r))),
	cashier: (f: Fixture, r: StaffRole) => outcome(executeQuery(GetCashierReport, getCashierReport, {}, as(f, r))),
	exportDs: (f: Fixture, r: StaffRole) => outcome(executeQuery(ExportDataset, exportDataset, { dataset: 'payments', from: TODAY, to: TODAY }, as(f, r))),
	grid: (f: Fixture, r: StaffRole) => outcome(executeQuery(GetInventoryGrid, getInventoryGrid, { month: '2030-03' }, as(f, r))),
	dashboard: (f: Fixture, r: StaffRole) => outcome(executeQuery(GetDashboard, getDashboard, {}, as(f, r))),
	posCatalog: (f: Fixture, r: StaffRole) => outcome(executeQuery(GetPosCatalog, getPosCatalog, {}, as(f, r))),
	setDaily: (f: Fixture, r: StaffRole) => outcome(executeCommand(SetDailyInventory, setDailyInventory, { roomTypeId: f.types[0]!.id, date: '2030-04-01', patch: { availableCount: 3 } }, as(f, r))),
	bulk: (f: Fixture, r: StaffRole) => outcome(executeCommand(BulkUpdateInventory, bulkUpdateInventory, { roomTypeId: f.types[0]!.id, from: '2030-04-01', to: '2030-04-02', patch: { isClosed: false } }, as(f, r))),
	channels: (f: Fixture, r: StaffRole) => outcome(executeQuery(GetChannels, getChannels, {}, as(f, r))),
	// deliberately invalid input: reaching VALIDATION means the permission gate passed
	mapping: (f: Fixture, r: StaffRole) => outcome(executeCommand(UpsertChannelMapping, upsertChannelMapping, {}, as(f, r))),
	create: (f: Fixture, r: StaffRole) =>
		outcome(executeCommand(CreateReservation, createFrontDeskReservation, { roomTypeId: f.types[0]!.id, checkIn: '2030-09-01', checkOut: '2030-09-02', adults: 1, guest }, as(f, r))),
	ledger: (f: Fixture, r: StaffRole) => outcome(executeQuery(GetFolioLedger, getFolioLedger, { reservationId: randomUUID() }, as(f, r))),
	setup: (f: Fixture, r: StaffRole) => outcome(executeQuery(GetSetup, getSetup, {}, as(f, r))),
	perms: (f: Fixture, r: StaffRole) => outcome(executeQuery(GetPermissions, getPermissions, {}, as(f, r))),
	staffList: (f: Fixture, r: StaffRole) => outcome(executeQuery(GetStaff, getStaff, {}, as(f, r)))
};

describe('permission coverage (no DB)', () => {
	it('maps every contract to a permission key, public or authenticated, 59 in total', () => {
		const mods = import.meta.glob('../features/**/contract.ts', { eager: true }) as Record<string, Record<string, unknown>>;
		const contracts = Object.values(mods)
			.flatMap((m) => Object.values(m))
			.filter((v): v is { kind: string; name: string; permission: unknown } => typeof v === 'object' && v !== null && 'kind' in v && ((v as { kind: unknown }).kind === 'command' || (v as { kind: unknown }).kind === 'query'));
		const keys: readonly unknown[] = PERMISSION_KEYS;
		for (const c of contracts) expect(c.permission === 'public' || c.permission === 'authenticated' || keys.includes(c.permission), c.name).toBe(true);
		expect(contracts.filter((c) => c.permission === 'public').map((c) => c.name).sort()).toEqual(
			['bookingEngine.book', 'bookingEngine.confirmation', 'bookingEngine.search', 'channels.ingestReservation']
		);
		expect(contracts.filter((c) => c.permission === 'authenticated').map((c) => c.name)).toEqual(['account.changePassword']);
		expect(contracts).toHaveLength(59);
		expect(new Set(contracts.map((c) => c.name)).size).toBe(59);
	});

	it('pins every contract to its permission (security contract)', () => {
		const P = 'public' as const;
		const EXPECTED: Record<string, PermissionKey | 'public' | 'authenticated'> = {
			'bookingEngine.search': P, 'bookingEngine.book': P, 'bookingEngine.confirmation': P, 'channels.ingestReservation': P,
			'frontDesk.dailyOps': 'frontDesk.view',
			'frontDesk.checkIn': 'frontDesk.manage', 'frontDesk.checkOut': 'frontDesk.manage',
			'reservations.tapeChart': 'tapeChart.view',
			'reservations.blockRoom': 'tapeChart.manage', 'reservations.unblockRoom': 'tapeChart.manage',
			'reservations.search': 'reservations.view', 'reservations.detail': 'reservations.view', 'audit.log': 'reservations.view',
			'reservations.create': 'reservations.manage', 'reservations.modify': 'reservations.manage', 'reservations.cancel': 'reservations.manage',
			'reservations.markNoShow': 'reservations.manage', 'reservations.assignRoom': 'reservations.manage', 'reservations.moveRoom': 'reservations.manage',
			'folio.ledger': 'folio.view',
			'folio.recordPayment': 'folio.manage', 'folio.refundPayment': 'folio.manage', 'folio.voidItem': 'folio.manage', 'folio.transferItem': 'folio.manage',
			'folio.openSplit': 'folio.manage', 'folio.updateBilling': 'folio.manage', 'folio.postRoomCharges': 'folio.manage',
			'folio.voidPayment': 'folio.voidPayment',
			'folio.nightAudit': 'folio.nightAudit',
			'folio.postCharge': 'pos.post', 'folio.posCatalog': 'pos.post', 'folio.findInHouseRoom': 'pos.post',
			'housekeeping.board': 'housekeeping.view',
			'housekeeping.setRoomStatus': 'housekeeping.manage',
			'inventory.grid': 'inventory.view',
			'inventory.setDaily': 'inventory.manage', 'inventory.bulkUpdate': 'inventory.manage', 'inventory.bulkUpdateRatePlan': 'inventory.manage',
			'channels.get': 'channels.view',
			'channels.upsertMapping': 'channels.manage', 'channels.syncIcal': 'channels.manage', 'channels.processOutbox': 'channels.manage',
			'reports.cashier': 'reports.view',
			'reports.export': 'reports.export',
			'insights.dashboard': 'insights.view',
			'setup.get': 'setup.manage', 'setup.updatePropertySettings': 'setup.manage', 'setup.createRoomType': 'setup.manage', 'setup.createRoomUnit': 'setup.manage',
			'setup.upsertCatalogItem': 'setup.manage', 'setup.upsertRatePlan': 'setup.manage', 'setup.upsertTaxRule': 'setup.manage',
			'access.permissions': 'roles.manage', 'access.savePermissions': 'roles.manage',
			'staff.list': 'staff.manage', 'staff.create': 'staff.manage', 'staff.update': 'staff.manage', 'staff.resetPassword': 'staff.manage',
			'account.changePassword': 'authenticated'
		};
		const mods = import.meta.glob('../features/**/contract.ts', { eager: true }) as Record<string, Record<string, unknown>>;
		const actual: Record<string, unknown> = {};
		for (const v of Object.values(mods).flatMap((m) => Object.values(m))) {
			if (typeof v === 'object' && v !== null && 'kind' in v && ((v as { kind: unknown }).kind === 'command' || (v as { kind: unknown }).kind === 'query')) {
				const c = v as unknown as { name: string; permission: unknown };
				actual[c.name] = c.permission;
			}
		}
		expect(Object.keys(EXPECTED)).toHaveLength(59);
		expect(actual).toEqual(EXPECTED);
	});

	it('ADMIN permission load issues no query', async () => {
		const stub = new Proxy({}, { get: () => { throw new Error('ADMIN must not query'); } }) as unknown as Parameters<typeof loadPermissions>[0];
		const perms = await loadPermissions(stub, randomUUID(), 'ADMIN');
		expect(perms).toEqual(new Set(PERMISSION_KEYS));
		expect(perms.size).toBe(24);
	});
});

describe.skipIf(!TEST_DB_URL)('role permissions (integration)', () => {
	it('enforces the default matrix per role', async () => {
		const f = await makeProperty(db, [['Std', 10000, 2]]);
		const fd: StaffRole = 'FRONT_DESK';
		expect(await probe.search(f, fd)).toBe('OK');
		expect(await probe.cashier(f, fd)).toBe('OK');
		expect(await probe.exportDs(f, fd)).toBe('FORBIDDEN');
		expect(await probe.grid(f, fd)).toBe('FORBIDDEN');
		expect(await probe.dashboard(f, fd)).toBe('FORBIDDEN');

		expect(await probe.posCatalog(f, 'POS')).toBe('OK');
		expect(await probe.search(f, 'POS')).toBe('FORBIDDEN');
		expect(await probe.grid(f, 'POS')).toBe('FORBIDDEN');

		const rm: StaffRole = 'REVENUE_MANAGER';
		expect(await probe.setDaily(f, rm)).toBe('OK');
		expect(await probe.channels(f, rm)).toBe('OK');
		expect(await probe.dashboard(f, rm)).toBe('OK');
		expect(await probe.create(f, rm)).toBe('FORBIDDEN');
		expect(await probe.ledger(f, rm)).toBe('FORBIDDEN');

		const mgr: StaffRole = 'MANAGER';
		expect(await probe.setup(f, mgr)).toBe('OK');
		expect(await probe.dashboard(f, mgr)).toBe('OK');
		expect(await probe.exportDs(f, mgr)).toBe('OK');
		expect(await probe.bulk(f, mgr)).toBe('OK');
		expect(await probe.mapping(f, mgr)).toBe('VALIDATION');
		expect(await probe.perms(f, mgr)).toBe('FORBIDDEN');

		expect(await probe.perms(f, 'ADMIN')).toBe('OK');
		expect(await probe.staffList(f, 'MANAGER')).toBe('OK');
		expect(await probe.staffList(f, 'ADMIN')).toBe('OK');
		expect(await probe.staffList(f, 'FRONT_DESK')).toBe('FORBIDDEN');
		expect(await probe.staffList(f, 'POS')).toBe('FORBIDDEN');
		expect(await probe.staffList(f, 'REVENUE_MANAGER')).toBe('FORBIDDEN');
		// defaults live in code: no rows were needed
		expect(await rows(f, 'FRONT_DESK')).toHaveLength(0);
	});

	it('applies grid changes on the next request and reports customized roles', async () => {
		const f = await makeProperty(db, [['Std', 10000, 2]]);
		const fdDefault = [...DEFAULT_GRANTS.FRONT_DESK];
		const view0 = await executeQuery(GetPermissions, getPermissions, {}, admin(f));
		expect(view0.grants.FRONT_DESK).toEqual(PERMISSION_KEYS.filter((k) => fdDefault.includes(k)));
		expect(view0.grants.ADMIN).toEqual([...PERMISSION_KEYS]);
		expect(Object.values(view0.customized).some(Boolean)).toBe(false);

		// grant insights.view
		const withInsights = toggleGrant(fdDefault, 'insights.view', true);
		expect(await executeCommand(SavePermissions, savePermissions, { grants: [{ role: 'FRONT_DESK', permissions: withInsights }] }, admin(f))).toEqual({ roles: 1, overrides: 1 });
		expect(await probe.dashboard(f, 'FRONT_DESK')).toBe('OK');
		const view1 = await executeQuery(GetPermissions, getPermissions, {}, admin(f));
		expect(view1.grants.FRONT_DESK).toContain('insights.view');
		expect(view1.customized.FRONT_DESK).toBe(true);
		expect(view1.customized.MANAGER).toBe(false);

		// revoke reservations.manage
		const noManage = toggleGrant(fdDefault, 'reservations.manage', false);
		await save(f, [{ role: 'FRONT_DESK', permissions: noManage }]);
		expect(await probe.create(f, 'FRONT_DESK')).toBe('FORBIDDEN');
		expect(await probe.dashboard(f, 'FRONT_DESK')).toBe('FORBIDDEN');
		expect(await probe.search(f, 'FRONT_DESK')).toBe('OK');
		expect((await executeQuery(GetPermissions, getPermissions, {}, admin(f))).grants.FRONT_DESK).not.toContain('reservations.manage');

		// reset to defaults removes every row
		expect(await executeCommand(SavePermissions, savePermissions, { grants: [{ role: 'FRONT_DESK', permissions: fdDefault }] }, admin(f))).toEqual({ roles: 1, overrides: 0 });
		expect(await rows(f, 'FRONT_DESK')).toHaveLength(0);
		expect(await probe.create(f, 'FRONT_DESK')).toBe('OK');
		expect((await executeQuery(GetPermissions, getPermissions, {}, admin(f))).customized.FRONT_DESK).toBe(false);
	});

	it('rejects locked and invalid grants, leaving nothing behind', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const before = await db.select().from(auditEvent).where(eq(auditEvent.propertyId, f.propertyId));
		const raw = (grants: unknown) => executeCommand(SavePermissions, savePermissions, { grants }, admin(f));

		expect((await failure(raw([{ role: 'ADMIN', permissions: [...PERMISSION_KEYS] }]))).code).toBe('VALIDATION');
		const locked = await failure(raw([{ role: 'MANAGER', permissions: [...DEFAULT_GRANTS.MANAGER, 'roles.manage'] }]));
		expect(locked.code).toBe('VALIDATION');
		expect(locked.message).toBe('Edit roles & permissions is reserved for the Super admin');
		const missing = await failure(raw([{ role: 'FRONT_DESK', permissions: ['reservations.manage'] }]));
		expect(missing.code).toBe('VALIDATION');
		expect(missing.message).toBe('Front desk: "Create, modify, cancel, no-show, assign & move rooms" requires "View & search reservations (incl. history)"');
		const dup = await failure(raw([{ role: 'POS', permissions: ['pos.post'] }, { role: 'POS', permissions: ['pos.post'] }]));
		expect(dup.code).toBe('VALIDATION');
		expect((await failure(raw([{ role: 'POS', permissions: ['nope.key'] }]))).code).toBe('VALIDATION');
		expect((await failure(raw([]))).code).toBe('VALIDATION');

		for (const r of ['MANAGER', 'FRONT_DESK', 'POS'] as const) expect(await rows(f, r)).toHaveLength(0);
		const after = await db.select().from(auditEvent).where(eq(auditEvent.propertyId, f.propertyId));
		expect(after).toHaveLength(before.length);
	});

	it('rejects ADMIN rows at the database (CHECK 23514)', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const err = await db.insert(rolePermission).values({ propertyId: f.propertyId, role: 'ADMIN', permission: 'setup.manage', granted: false }).then(() => null, (e: unknown) => e);
		expect(err).not.toBeNull();
		const e = err as { code?: string; cause?: { code?: string } };
		expect(e.code ?? e.cause?.code).toBe('23514');
		expect(await rows(f, 'ADMIN')).toHaveLength(0);
	});

	it('does not leak grants across properties', async () => {
		const a = await makeProperty(db, [['Std', 10000, 1]]);
		const b = await makeProperty(db, [['Std', 10000, 1]]);
		await save(a, [{ role: 'FRONT_DESK', permissions: toggleGrant(DEFAULT_GRANTS.FRONT_DESK, 'insights.view', true) }]);
		expect(await probe.dashboard(a, 'FRONT_DESK')).toBe('OK');
		expect(await probe.dashboard(b, 'FRONT_DESK')).toBe('FORBIDDEN');
		expect(await rows(b, 'FRONT_DESK')).toHaveLength(0);
	});

	it('audits a save exactly once with the actor and a readable label', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		await save(f, [{ role: 'POS', permissions: ['pos.post'] }]); // = default → still an audited command
		const ev = (await db.select().from(auditEvent).where(eq(auditEvent.propertyId, f.propertyId))).filter((e) => e.command === 'access.savePermissions');
		expect(ev).toHaveLength(1);
		expect(ev[0]!.actorUserId).toBe(f.admin.userId);
		expect(auditLabel('access.savePermissions')).toBe('Role permissions changed');
	});

	it('gates discounts on folio.manage and the full audit log on audit.view', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const r = await executeCommand(CreateReservation, createFrontDeskReservation, { roomTypeId: f.types[0]!.id, checkIn: TODAY, checkOut: addDays(TODAY, 1), adults: 1, guest }, admin(f));
		const { folioId } = await executeCommand(CheckIn, checkIn, { reservationId: r.reservationId, roomUnitId: f.types[0]!.units[0]!.id, idDocumentType: 'Passport', idDocumentNumber: 'P7654321' }, admin(f));
		const discount = { folioId, line: { kind: 'discount' as const, description: 'Goodwill', amountCents: 500 } };
		const custom = { folioId, line: { kind: 'custom' as const, category: 'FEE' as const, description: 'Late checkout', unitPriceCents: 1000, taxable: false } };
		const charge = (role: StaffRole, input: typeof discount | typeof custom) => outcome(executeCommand(PostCharge, postCharge, input, as(f, role)));

		// defaults: FD has folio.manage
		expect(await charge('FRONT_DESK', discount)).toBe('OK');
		await save(f, [{ role: 'FRONT_DESK', permissions: toggleGrant(DEFAULT_GRANTS.FRONT_DESK, 'folio.manage', false) }]);
		expect(await charge('FRONT_DESK', discount)).toBe('FORBIDDEN');
		expect(await charge('FRONT_DESK', custom)).toBe('OK');
		expect(await charge('POS', discount)).toBe('FORBIDDEN');
		expect(await charge('POS', custom)).toBe('OK');

		// full audit log
		const full = (role: StaffRole) => outcome(executeQuery(GetAuditLog, getAuditLog, {}, as(f, role)));
		expect(await full('FRONT_DESK')).toBe('FORBIDDEN');
		await save(f, [{ role: 'FRONT_DESK', permissions: toggleGrant(DEFAULT_GRANTS.FRONT_DESK, 'audit.view', true) }]);
		expect(await full('FRONT_DESK')).toBe('OK');
		// a reservation-scoped read stays open to anyone with reservations.view
		expect(await outcome(executeQuery(GetAuditLog, getAuditLog, { reservationId: r.reservationId }, as(f, 'MANAGER')))).toBe('OK');

		const bad = await failure(save(f, [{ role: 'POS', permissions: ['pos.post', 'audit.view'] }]));
		expect(bad.code).toBe('VALIDATION');
		expect(bad.message).toBe('POS: "Full audit log" requires "View & search reservations (incl. history)"');
	});

	it('serializes concurrent saves: both succeed and the result is exactly one submission', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const A = toggleGrant(DEFAULT_GRANTS.FRONT_DESK, 'insights.view', true);
		const B = toggleGrant(DEFAULT_GRANTS.FRONT_DESK, 'reservations.manage', false);
		const results = await Promise.allSettled([
			save(f, [{ role: 'FRONT_DESK', permissions: A }]),
			save(f, [{ role: 'FRONT_DESK', permissions: B }])
		]);
		expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
		const key = (xs: { permission: string; granted: boolean }[]) => xs.map((x) => `${x.permission}:${x.granted}`).sort();
		const got = key(await rows(f, 'FRONT_DESK'));
		expect([key(overridesFor('FRONT_DESK', A)), key(overridesFor('FRONT_DESK', B))]).toContainEqual(got);
		expect(got.length).toBeGreaterThan(0);
	});

	it('blocks non-admins from reading and saving the grid', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		for (const role of ['MANAGER', 'REVENUE_MANAGER', 'FRONT_DESK', 'POS'] as const) {
			expect(await outcome(executeCommand(SavePermissions, savePermissions, { grants: [{ role: 'POS', permissions: ['pos.post'] }] }, as(f, role))), role).toBe('FORBIDDEN');
			expect(await probe.perms(f, role), role).toBe('FORBIDDEN');
		}
		// a grid edit can never hand roles.manage to a non-admin
		expect(await rows(f, 'MANAGER')).toHaveLength(0);
	});
});
