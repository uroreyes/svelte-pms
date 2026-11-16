/**
 * Operational data reset (go-live) against a real Postgres.
 *
 * Uses its OWN database (`pms_test_reset`, created + migrated on demand): the reset takes table-level
 * locks (LOCK TABLE ... SHARE ROW EXCLUSIVE, ALTER TABLE ... DISABLE TRIGGER) that would stall every
 * other integration file running in parallel on the shared TEST_DATABASE_URL. Per-test tenants
 * (`makeProperty`) keep the tests isolated from each other; the DB is kept between runs.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb, type DB } from './db/client';
import { auditEvent, roomInventoryDaily } from './db/schema';
import { executeCommand, executePublicCommand } from './cqrs/execute';
import { addStaff, guest, makeProperty, NOW, TEST_DB_URL, TEST_PII_KEYRING, type Fixture } from './testkit';
import { auditLabel } from '$lib/shared/domain/audit-labels';
import { parseResetArgs, type ResetArgs } from './maintenance/reset-args';
import { resetOperationalData, runOperationalReset, type ResetCounts } from './maintenance/reset-operational-data';
import { UpsertChannelMapping } from '$lib/features/channels/upsert-mapping/contract';
import { upsertChannelMapping } from '$lib/features/channels/upsert-mapping/handler.server';
import { CreateReservation } from '$lib/features/reservations/create-reservation/contract';
import { createFrontDeskReservation } from '$lib/features/reservations/create-reservation/handler.server';
import { CancelReservation } from '$lib/features/reservations/cancel-reservation/contract';
import { cancelReservationHandler } from '$lib/features/reservations/cancel-reservation/handler.server';
import { BlockRoom } from '$lib/features/reservations/block-room/contract';
import { blockRoom } from '$lib/features/reservations/block-room/handler.server';
import { CheckIn } from '$lib/features/front-desk/check-in/contract';
import { makeCheckIn } from '$lib/features/front-desk/check-in/handler.server';
import { CheckOut } from '$lib/features/front-desk/check-out/contract';
import { checkOut } from '$lib/features/front-desk/check-out/handler.server';
import { PostCharge } from '$lib/features/folio/post-charge/contract';
import { postCharge } from '$lib/features/folio/post-charge/handler.server';
import { VoidItem } from '$lib/features/folio/void-item/contract';
import { voidItem } from '$lib/features/folio/void-item/handler.server';
import { RecordPayment } from '$lib/features/folio/record-payment/contract';
import { recordPayment } from '$lib/features/folio/record-payment/handler.server';
import { RefundPayment } from '$lib/features/folio/refund-payment/contract';
import { refundPayment } from '$lib/features/folio/refund-payment/handler.server';
import { CreateBooking } from '$lib/features/booking-engine/create-booking/contract';
import { createBooking } from '$lib/features/booking-engine/create-booking/handler.server';

const checkIn = makeCheckIn(() => TEST_PII_KEYRING);
const RESET_DB = 'pms_test_reset';

let db: DB;
let closeDb: (() => Promise<void>) | undefined;
let admin: postgres.Sql | undefined;

beforeAll(async () => {
	if (!TEST_DB_URL) return;
	admin = postgres(TEST_DB_URL, { max: 1, onnotice: () => {} });
	const found = await admin`SELECT 1 FROM pg_database WHERE datname = ${RESET_DB}`;
	if (found.length === 0) await admin.unsafe(`CREATE DATABASE ${RESET_DB}`);
	const url = new URL(TEST_DB_URL);
	url.pathname = `/${RESET_DB}`;
	const conn = createDb(url.toString(), { max: 6 });
	db = conn.db;
	closeDb = conn.close;
	await migrate(db, { migrationsFolder: 'drizzle' });
}, 120_000);
afterAll(async () => {
	await closeDb?.();
	await admin?.end({ timeout: 5 });
});

type Rows = Record<string, unknown>[];
const q = async (query: ReturnType<typeof sql>): Promise<Rows> => (await db.execute(query)) as unknown as Rows;

// ---------- fixture ----------

interface Seeded {
	f: Fixture;
	folioId: string;
	operators: { frontDesk: string; inactiveAdmin: string; system: string; mustChange: string };
}

const ctx = (f: Fixture) => ({ db, actor: f.admin, now: NOW });

async function seedOps(f: Fixture, opts: { withInvoice: boolean }): Promise<Seeded> {
	const c = ctx(f);
	const type = f.types[0]!;
	const frontDesk = await addStaff(db, f, { role: 'FRONT_DESK' });
	const inactive = await addStaff(db, f, { role: 'ADMIN', active: false });
	const system = await addStaff(db, f, { role: 'ADMIN', active: false, isSystem: true });
	const mustChange = await addStaff(db, f, { role: 'ADMIN', mustChangePassword: true });

	await executeCommand(UpsertChannelMapping, upsertChannelMapping, { roomTypeId: type.id, channelName: 'BOOKING_COM', externalRoomId: `ext-${f.slug}`, pushUrl: 'https://channel.example.com/push', active: true }, c);

	const r1 = await executeCommand(CreateReservation, createFrontDeskReservation, { roomTypeId: type.id, checkIn: '2030-03-01', checkOut: '2030-03-02', adults: 1, guest, roomUnitId: type.units[0]!.id }, c);
	const ci = await executeCommand(CheckIn, checkIn, { reservationId: r1.reservationId, idDocumentType: 'PASSPORT', idDocumentNumber: 'X1234567' }, c);

	const taxable = await executeCommand(PostCharge, postCharge, { folioId: ci.folioId, quantity: 2, line: { kind: 'custom', category: 'F&B', description: 'Dinner', unitPriceCents: 2500, taxable: true } }, c);
	const voided = await executeCommand(PostCharge, postCharge, { folioId: ci.folioId, quantity: 1, line: { kind: 'custom', category: 'F&B', description: 'Mistake', unitPriceCents: 900, taxable: true } }, c);
	void taxable;
	await executeCommand(VoidItem, voidItem, { itemId: voided.itemId, reason: 'posted in error' }, c);
	const pay = await executeCommand(RecordPayment, recordPayment, { folioId: ci.folioId, method: 'CARD', amountCents: 5000, referenceNo: 'AUTH1234' }, c);
	await executeCommand(RefundPayment, refundPayment, { paymentId: pay.paymentId, amountCents: 1000, reason: 'goodwill' }, c);
	if (opts.withInvoice) {
		await executeCommand(CheckOut, checkOut, { reservationId: r1.reservationId, settleWith: { method: 'CASH' } }, c);
	}

	await executePublicCommand(
		CreateBooking,
		createBooking,
		{ property: f.slug, checkIn: '2030-07-01', checkOut: '2030-07-02', rooms: [{ roomTypeId: type.id, adults: 1 }], guest, expectedTotalCents: 11000 },
		{ db, now: NOW }
	);
	const r3 = await executeCommand(CreateReservation, createFrontDeskReservation, { roomTypeId: type.id, checkIn: '2030-08-01', checkOut: '2030-08-03', adults: 1, guest }, c);
	await executeCommand(CancelReservation, cancelReservationHandler, { reservationId: r3.reservationId }, c);
	await executeCommand(BlockRoom, blockRoom, { roomUnitId: type.units[1]!.id, startDate: '2030-09-01', endDate: '2030-09-03', reason: 'Maintenance' }, c);

	return { f, folioId: ci.folioId, operators: { frontDesk: frontDesk.email, inactiveAdmin: inactive.email, system: system.email, mustChange: mustChange.email } };
}

// ---------- helpers ----------

const COUNT_KEYS: (keyof ResetCounts)[] = [
	'auditEvents', 'folioItemTaxes', 'folioItems', 'folioPayments', 'folios', 'reservationNights', 'reservations',
	'bookings', 'guests', 'roomBlocks', 'channelOutbox', 'invoiceCounters', 'inventoryDaysReset'
];

const inRes = (p: string) => `reservation_id IN (SELECT id FROM reservation WHERE property_id = '${p}')`;
const inFolio = (p: string) => `folio_id IN (SELECT id FROM folio WHERE property_id = '${p}')`;
const inType = (p: string) => `room_type_id IN (SELECT id FROM room_type WHERE property_id = '${p}')`;

/** Operational tables (deleted by the reset): [name, FROM-clause] keyed by ResetCounts key. */
const opScope = (p: string): Record<keyof ResetCounts, [string, string]> => ({
	auditEvents: ['audit_event', `property_id = '${p}' OR ${inRes(p)}`],
	folioItemTaxes: ['folio_item_tax', `folio_item_id IN (SELECT id FROM folio_item WHERE ${inFolio(p)})`],
	folioItems: ['folio_item', inFolio(p)],
	folioPayments: ['folio_payment', inFolio(p)],
	folios: ['folio', `property_id = '${p}'`],
	reservationNights: ['reservation_night', inRes(p)],
	reservations: ['reservation', `property_id = '${p}'`],
	bookings: ['booking', `property_id = '${p}'`],
	guests: ['guest', `property_id = '${p}'`],
	roomBlocks: ['room_block', `property_id = '${p}'`],
	channelOutbox: ['channel_outbox', `property_id = '${p}'`],
	invoiceCounters: ['invoice_counter', `property_id = '${p}'`],
	inventoryDaysReset: ['room_inventory_daily', `${inType(p)} AND sold_count <> 0`]
});

/** Config tables kept by the reset: [name, FROM-clause, columns removed from the row json]. */
const configScope = (p: string): Record<string, [string, string, string[]]> => ({
	property: ['property', `id = '${p}'`, []],
	staff_user: ['staff_user', `property_id = '${p}'`, []],
	session: ['session', `user_id IN (SELECT id FROM staff_user WHERE property_id = '${p}')`, []],
	role_permission: ['role_permission', `property_id = '${p}'`, []],
	room_type: ['room_type', `property_id = '${p}'`, []],
	room_unit: ['room_unit', `property_id = '${p}'`, []],
	room_inventory_config: ['room_inventory_daily', inType(p), ['sold_count', 'updated_at']],
	rate_plan: ['rate_plan', `property_id = '${p}'`, []],
	rate_plan_daily: ['rate_plan_daily', `rate_plan_id IN (SELECT id FROM rate_plan WHERE property_id = '${p}')`, []],
	tax_rule: ['tax_rule', `property_id = '${p}'`, []],
	catalog_item: ['catalog_item', `property_id = '${p}'`, []],
	channel_mapping: ['channel_mapping', `property_id = '${p}'`, []]
});

const hash = async (table: string, where: string, minus: string[]): Promise<string> => {
	const strip = minus.map((c) => ` - '${c}'`).join('');
	const rows = await q(sql.raw(`SELECT md5(coalesce(string_agg(j, '|' ORDER BY j), '')) AS h FROM (SELECT (to_jsonb(t)${strip})::text AS j FROM "${table}" t WHERE ${where}) s`));
	return String(rows[0]!.h);
};

async function counts(p: string): Promise<Record<keyof ResetCounts, number>> {
	const out = {} as Record<keyof ResetCounts, number>;
	for (const [key, [table, where]] of Object.entries(opScope(p)) as [keyof ResetCounts, [string, string]][]) {
		const rows = await q(sql.raw(`SELECT count(*)::int AS n FROM "${table}" WHERE ${where}`));
		out[key] = Number(rows[0]!.n);
	}
	return out;
}

const configFingerprint = async (p: string) =>
	Object.fromEntries(await Promise.all(Object.entries(configScope(p)).map(async ([k, [t, w, m]]) => [k, await hash(t, w, m)] as const)));
const opsFingerprint = async (p: string) =>
	Object.fromEntries(await Promise.all(Object.entries(opScope(p)).map(async ([k, [t, w]]) => [k, await hash(t, w, [])] as const)));
const fingerprint = async (p: string) => ({ config: await configFingerprint(p), ops: await opsFingerprint(p) });

async function triggersEnabled(): Promise<number> {
	const rows = await q(sql`
		SELECT count(*)::int AS n FROM pg_trigger t
		WHERE t.tgrelid = ANY(ARRAY['folio_item','folio_item_tax','folio_payment','audit_event']::regclass[])
		AND t.tgname = ANY(ARRAY['folio_item_append_only','folio_item_tax_append_only','folio_payment_append_only','audit_event_append_only']::name[])
		AND t.tgenabled = 'O'`);
	return Number(rows[0]!.n);
}

const messageOf = (e: unknown): string => {
	const parts: string[] = [];
	for (let cur: unknown = e; cur instanceof Error; cur = (cur as Error & { cause?: unknown }).cause) parts.push(cur.message);
	return parts.join(' | ');
};
async function rejection(p: Promise<unknown>): Promise<string> {
	const e = await p.then(() => null, (x: unknown) => x);
	expect(e, 'expected the statement to be rejected').not.toBeNull();
	return messageOf(e);
}
const rejectsLedgerUpdate = async (folioId: string) =>
	expect(await rejection(db.execute(sql`UPDATE folio_item SET description = 'x' WHERE folio_id = ${folioId}`))).toContain('Ledger table "folio_item" is append-only: UPDATE is not allowed');

async function run(args: ResetArgs) {
	const log: string[] = [];
	const err: string[] = [];
	const code = await runOperationalReset(db, args, { now: NOW, log: (l) => log.push(l), error: (l) => err.push(l) });
	return { code, log, err };
}
const argsFor = (f: Fixture, extra: Partial<ResetArgs> = {}): ResetArgs => ({ propertySlug: f.slug, operatorEmail: f.admin.email, confirm: null, force: false, ...extra });

const sumSold = async (p: string) => Number((await q(sql.raw(`SELECT coalesce(sum(sold_count),0)::int AS n FROM room_inventory_daily WHERE ${inType(p)}`)))[0]!.n);
const folioOf = async (p: string) => String((await q(sql.raw(`SELECT id FROM folio WHERE property_id = '${p}' ORDER BY created_at LIMIT 1`)))[0]!.id);

// ---------- suite ----------

describe.skipIf(!TEST_DB_URL)('operational data reset (integration, isolated DB)', () => {
	let A: Seeded;
	let B: Seeded;
	let beforeA: Record<keyof ResetCounts, number>;

	beforeAll(async () => {
		A = await seedOps(await makeProperty(db, [['Std', 10000, 2]], { mode: 'UPFRONT' }), { withInvoice: true });
		B = await seedOps(await makeProperty(db, [['Std', 10000, 2]], { mode: 'UPFRONT' }), { withInvoice: true });
		beforeA = await counts(A.f.propertyId);
	}, 120_000);

	it('fixture covers every table the reset touches (non-zero counts)', () => {
		for (const k of COUNT_KEYS.filter((k) => k !== 'inventoryDaysReset')) expect(beforeA[k], k).toBeGreaterThan(0);
		expect(beforeA.inventoryDaysReset).toBeGreaterThan(0);
		expect(beforeA.invoiceCounters).toBe(1);
	});

	it('dry run changes nothing and logs every count with its value', async () => {
		const fp = await fingerprint(A.f.propertyId);
		const r = await run(argsFor(A.f));
		expect(r.code).toBe(0);
		expect(r.err).toEqual([]);
		for (const k of COUNT_KEYS) expect(r.log, k).toContain(`  ${k}: ${beforeA[k]}`);
		expect(r.log.some((l) => l.includes('Dry run — nothing changed'))).toBe(true);
		expect(r.log.some((l) => l.includes('Would refuse without --force'))).toBe(true);
		expect(r.log.some((l) => l.includes('Reset complete'))).toBe(false);
		expect(await fingerprint(A.f.propertyId)).toEqual(fp);
		expect(await triggersEnabled()).toBe(4);
	});

	it('refuses a --confirm that does not match the slug', async () => {
		const fp = await fingerprint(A.f.propertyId);
		const r = await run(argsFor(A.f, { confirm: 'wrong', force: true }));
		expect(r.code).toBe(1);
		expect(r.err.join('\n')).toMatch(/does not match property slug/);
		expect(await fingerprint(A.f.propertyId)).toEqual(fp);
		expect(await triggersEnabled()).toBe(4);
	});

	describe('operator validation', () => {
		const variants: [string, () => string][] = [
			['FRONT_DESK user', () => A.operators.frontDesk],
			['inactive ADMIN', () => A.operators.inactiveAdmin],
			['system user', () => A.operators.system],
			['ADMIN who must change password', () => A.operators.mustChange],
			["another property's ADMIN", () => B.f.admin.email],
			['unknown email', () => 'nobody@nowhere.test']
		];
		for (const [label, email] of variants) {
			for (const mode of ['dry run', 'real run'] as const) {
				it(`${label} is refused (${mode})`, async () => {
					const fp = await fingerprint(A.f.propertyId);
					const r = await run(argsFor(A.f, { operatorEmail: email(), confirm: mode === 'dry run' ? null : A.f.slug, force: true }));
					expect(r.code).toBe(1);
					expect(r.err.join('\n')).toContain('is not an active ADMIN');
					expect(await fingerprint(A.f.propertyId)).toEqual(fp);
					expect(await triggersEnabled()).toBe(4);
				});
			}
		}
	});

	it('refuses to delete issued invoices without --force', async () => {
		const fp = await fingerprint(A.f.propertyId);
		const r = await run(argsFor(A.f, { confirm: A.f.slug, force: false }));
		expect(r.code).toBe(1);
		expect(r.err.join('\n')).toContain('Refusing: 1 invoice(s)');
		expect(await fingerprint(A.f.propertyId)).toEqual(fp);
		expect(await triggersEnabled()).toBe(4);
	});

	it('refuses a counter-only invoice history without --force', async () => {
		const G = await seedOps(await makeProperty(db, [['Std', 10000, 2]], { mode: 'UPFRONT' }), { withInvoice: false });
		await db.execute(sql`INSERT INTO invoice_counter (property_id, last_number) VALUES (${G.f.propertyId}, 1) ON CONFLICT (property_id) DO UPDATE SET last_number = 1`);
		const fp = await fingerprint(G.f.propertyId);
		const r = await run(argsFor(G.f, { confirm: G.f.slug, force: false }));
		expect(r.code).toBe(1);
		expect(r.err.join('\n')).toContain('Refusing: 0 invoice(s)');
		expect(await fingerprint(G.f.propertyId)).toEqual(fp);
		expect(await triggersEnabled()).toBe(4);
	});

	it('an unknown property slug is refused', async () => {
		const fp = await fingerprint(A.f.propertyId);
		const r = await run(argsFor(A.f, { propertySlug: 'no-such-property', confirm: 'no-such-property', force: true }));
		expect(r.code).toBe(1);
		expect(r.err.join('\n')).toContain('Property "no-such-property" not found');
		expect(await fingerprint(A.f.propertyId)).toEqual(fp);
		expect(await triggersEnabled()).toBe(4);
	});

	it('an injected failure after the deletes (triggers disabled) rolls everything back and re-enables the triggers', async () => {
		const E = await seedOps(await makeProperty(db, [['Std', 10000, 2]], { mode: 'UPFRONT' }), { withInvoice: false });
		const fp = await fingerprint(E.f.propertyId);
		const bFp = await fingerprint(B.f.propertyId);
		const base = { propertySlug: E.f.slug, operatorEmail: E.f.admin.email, confirm: E.f.slug, force: false, now: NOW };
		let triggersDuringFailure = -1;
		await expect(
			resetOperationalData(db, {
				...base,
				afterDelete: async (tx) => {
					const rows = (await tx.execute(sql`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE '%\_append\_only' AND tgenabled = 'O'`)) as unknown as Rows;
					triggersDuringFailure = Number(rows[0]!.n);
					throw new Error('boom');
				}
			})
		).rejects.toThrow('boom');
		expect(triggersDuringFailure).toBeLessThan(4);
		expect(await triggersEnabled()).toBe(4);
		expect(await fingerprint(E.f.propertyId)).toEqual(fp);
		expect((await counts(E.f.propertyId)).folioItems).toBeGreaterThan(0);
		expect(await fingerprint(B.f.propertyId)).toEqual(bFp);
		await rejectsLedgerUpdate(await folioOf(B.f.propertyId));
	});

	it('an injected failure before commit (after the audit row) leaves no partial state', async () => {
		const D = await seedOps(await makeProperty(db, [['Std', 10000, 2]], { mode: 'UPFRONT' }), { withInvoice: false });
		const fp = await fingerprint(D.f.propertyId);
		let auditRowsInTx = -1;
		await expect(
			resetOperationalData(db, {
				propertySlug: D.f.slug,
				operatorEmail: D.f.admin.email,
				confirm: D.f.slug,
				force: false,
				now: NOW,
				beforeCommit: async (tx) => {
					const rows = (await tx.execute(sql`SELECT count(*)::int AS n FROM audit_event WHERE command = 'ops.resetOperationalData' AND property_id = ${D.f.propertyId}`)) as unknown as Rows;
					auditRowsInTx = Number(rows[0]!.n);
					throw new Error('boom');
				}
			})
		).rejects.toThrow('boom');
		expect(auditRowsInTx).toBe(1);
		expect(await fingerprint(D.f.propertyId)).toEqual(fp);
		expect(await triggersEnabled()).toBe(4);
	});

	it('a property without invoices resets without --force', async () => {
		const C = await seedOps(await makeProperty(db, [['Std', 10000, 2]], { mode: 'UPFRONT' }), { withInvoice: false });
		const r = await run(argsFor(C.f, { confirm: C.f.slug, force: false }));
		expect(r.code).toBe(0);
		expect(r.err).toEqual([]);
		const after = await counts(C.f.propertyId);
		expect(after).toEqual({ ...Object.fromEntries(COUNT_KEYS.map((k) => [k, 0])), auditEvents: 1 });
		expect(await triggersEnabled()).toBe(4);
	});

	describe('real run with --force on property A', () => {
		let bBefore: Awaited<ReturnType<typeof fingerprint>>;
		let aConfigBefore: Record<string, string>;
		let inventoryBefore: Rows;
		let r: Awaited<ReturnType<typeof run>>;

		beforeAll(async () => {
			bBefore = await fingerprint(B.f.propertyId);
			aConfigBefore = await configFingerprint(A.f.propertyId);
			inventoryBefore = await q(sql.raw(`SELECT room_type_id, date, available_count, rate_override_cents, min_los, is_closed FROM room_inventory_daily WHERE ${inType(A.f.propertyId)} ORDER BY room_type_id, date`));
			r = await run(argsFor(A.f, { confirm: A.f.slug, force: true }));
		}, 60_000);

		it('exits 0 and removes exactly the operational rows (only the reset audit row remains)', async () => {
			expect(r.code).toBe(0);
			expect(r.err).toEqual([]);
			const idx = r.log.findIndex((l) => l.includes('Reset complete'));
			expect(idx).toBeGreaterThan(-1);
			for (const k of COUNT_KEYS) expect(r.log.slice(idx), k).toContain(`  ${k}: ${beforeA[k]}`);
			expect(await counts(A.f.propertyId)).toEqual({ ...Object.fromEntries(COUNT_KEYS.map((k) => [k, 0])), auditEvents: 1 });
		});

		it('zeroes sold_count while availability, rates, min_los and closures are unchanged', async () => {
			expect(await sumSold(A.f.propertyId)).toBe(0);
			const after = await q(sql.raw(`SELECT room_type_id, date, available_count, rate_override_cents, min_los, is_closed FROM room_inventory_daily WHERE ${inType(A.f.propertyId)} ORDER BY room_type_id, date`));
			expect(after).toEqual(inventoryBefore);
			expect(after.length).toBeGreaterThan(0);
		});

		it('keeps all configuration tables untouched and the other property byte-identical', async () => {
			expect(await configFingerprint(A.f.propertyId)).toEqual(aConfigBefore);
			expect(await fingerprint(B.f.propertyId)).toEqual(bBefore);
		});

		it('writes exactly one attributed audit row whose result equals the deleted counts', async () => {
			const rows = await db.select().from(auditEvent).where(eq(auditEvent.propertyId, A.f.propertyId));
			expect(rows).toHaveLength(1);
			const row = rows[0]!;
			expect(row.command).toBe('ops.resetOperationalData');
			expect(row.actorUserId).toBe(A.f.admin.userId);
			expect(row.actorLabel).toBe('Tess Admin');
			expect(row.input).toEqual({ propertySlug: A.f.slug, force: true });
			expect(row.result).toEqual(beforeA);
			for (const k of ['folioItems', 'guests', 'bookings', 'channelOutbox', 'roomBlocks'] as const) expect((row.result as ResetCounts)[k], k).toBeGreaterThan(0);
			expect((row.result as ResetCounts).invoiceCounters).toBe(1);
			expect(auditLabel(row.command)).toBe('Operational data reset');
		});

		it('leaves the append-only triggers active', async () => {
			expect(await triggersEnabled()).toBe(4);
			const bFolio = await folioOf(B.f.propertyId);
			await rejectsLedgerUpdate(bFolio);
			expect(await rejection(db.execute(sql`DELETE FROM audit_event WHERE property_id = ${B.f.propertyId}`))).toContain('append-only');
			expect(await rejection(db.execute(sql`UPDATE folio_payment SET method = 'CASH' WHERE folio_id = ${bFolio}`))).toContain('append-only');
			expect(
				await rejection(db.execute(sql`UPDATE folio_item_tax SET amount_cents = amount_cents WHERE folio_item_id IN (SELECT id FROM folio_item WHERE folio_id = ${bFolio})`))
			).toContain('append-only');
		});

		it('a second run is harmless: only the previous audit row is removed and exactly one remains', async () => {
			const again = await run(argsFor(A.f, { confirm: A.f.slug, force: false }));
			expect(again.code).toBe(0);
			const idx = again.log.findIndex((l) => l.includes('Reset complete'));
			const tail = again.log.slice(idx);
			for (const k of COUNT_KEYS) expect(tail, k).toContain(`  ${k}: ${k === 'auditEvents' ? 1 : 0}`);
			expect(await db.select().from(auditEvent).where(eq(auditEvent.propertyId, A.f.propertyId))).toHaveLength(1);
			expect(await configFingerprint(A.f.propertyId)).toEqual(aConfigBefore);
			expect(await fingerprint(B.f.propertyId)).toEqual(bBefore);
			expect(await triggersEnabled()).toBe(4);
		});

		it('inventory rows exist and are sellable again after the reset', async () => {
			const rows = await db.select().from(roomInventoryDaily).where(sql`${roomInventoryDaily.roomTypeId} = ${A.f.types[0]!.id}`);
			expect(rows.every((x) => x.soldCount === 0)).toBe(true);
		});
	});
});

describe('reset script wiring', () => {
	it('the migrate image CMD never runs reset-operational-data', () => {
		const dockerfile = readFileSync(resolve(process.cwd(), 'docker/migrate/Dockerfile'), 'utf8');
		const cmd = dockerfile.split('\n').filter((l) => /^\s*CMD\b/.test(l));
		expect(cmd.length).toBeGreaterThan(0);
		for (const l of cmd) expect(l).not.toContain('reset-operational-data');
	});

	it('the CLI parser feeds runOperationalReset with the same argument shape', () => {
		const parsed = parseResetArgs(['--property', 'x', '--operator', 'A@B.test']);
		expect(parsed).toEqual({ ok: true, args: { propertySlug: 'x', operatorEmail: 'a@b.test', confirm: null, force: false } });
	});
});
