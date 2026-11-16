/** PR-21 Done-when proofs: ID numbers are encrypted at rest, masked on read, redacted in audit, backfilled and rotated online. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type { DB } from './db/client';
import { auditEvent, reservation } from './db/schema';
import { executeCommand, executeQuery } from './cqrs/execute';
import { pgErrorCode, PG } from './db/pg-errors';
import { CreateReservation } from '$lib/features/reservations/create-reservation/contract';
import { createFrontDeskReservation } from '$lib/features/reservations/create-reservation/handler.server';
import { CheckIn } from '$lib/features/front-desk/check-in/contract';
import { makeCheckIn } from '$lib/features/front-desk/check-in/handler.server';
import { GetReservation } from '$lib/features/reservations/get-reservation/contract';
import { getReservation } from '$lib/features/reservations/get-reservation/handler.server';
import { ENVELOPE_PATTERN, decryptField, parseKeyring, type PiiKeyring } from './security/crypto';
import { reencryptIdDocuments } from './maintenance/reencrypt-id-documents';
import { NOW, TODAY, TEST_DB_URL, TEST_PII_KEYRING, guest, makeProperty, openTestDb, type Fixture } from './testkit';

let db: DB;
let close: () => Promise<void>;

beforeAll(() => {
	if (!TEST_DB_URL) return;
	({ db, close } = openTestDb());
});
afterAll(async () => close?.());

const ENVELOPE_RE = new RegExp(ENVELOPE_PATTERN);
const b64 = (n: number) => Buffer.alloc(32, n).toString('base64');
const ringK1 = TEST_PII_KEYRING; // active key id `test`
const ringK2 = parseKeyring(`k2:${b64(9)}`, `test:${b64(7)}`);
const ringK3Only = parseKeyring(`k3:${b64(11)}`);
const checkIn = makeCheckIn(() => ringK1);

const ctx = (f: Fixture) => ({ db, actor: f.admin, now: NOW });

async function book(f: Fixture) {
	return executeCommand(
		CreateReservation,
		createFrontDeskReservation,
		{ roomTypeId: f.types[0]!.id, checkIn: TODAY, checkOut: '2030-03-03', adults: 1, guest },
		ctx(f)
	);
}

async function checkInWith(f: Fixture, reservationId: string, unitIdx: number, idDocumentNumber: string) {
	return executeCommand(
		CheckIn,
		checkIn,
		{ reservationId, roomUnitId: f.types[0]!.units[unitIdx]!.id, idDocumentType: 'Passport', idDocumentNumber },
		ctx(f)
	);
}

async function guestIdOf(reservationId: string): Promise<string> {
	const [r] = await db.select({ guestId: reservation.guestId }).from(reservation).where(eq(reservation.id, reservationId));
	return r!.guestId;
}

async function rawGuest(id: string) {
	const rows = (await db.execute(sql`SELECT id_document_number AS num, id_document_last4 AS last4 FROM guest WHERE id = ${id}`)) as unknown as {
		num: string | null;
		last4: string | null;
	}[];
	return rows[0]!;
}

async function checkedInGuest(f: Fixture, number: string, unitIdx = 0) {
	const r = await book(f);
	await checkInWith(f, r.reservationId, unitIdx, number);
	return { reservationId: r.reservationId, guestId: await guestIdOf(r.reservationId) };
}

describe.skipIf(!TEST_DB_URL)('ID document encryption (PR-21)', () => {
	it('stores ciphertext at rest with last4 for display', async () => {
		const f = await makeProperty(db, [['Std', 10000, 2]]);
		const { guestId } = await checkedInGuest(f, 'X1234567');
		const raw = await rawGuest(guestId);
		expect(raw.num).toMatch(ENVELOPE_RE);
		expect(raw.num).not.toContain('1234567');
		expect(raw.last4).toBe('4567');
		expect(decryptField(TEST_PII_KEYRING, raw.num!, `guest:${guestId}`)).toBe('X1234567');
	});

	it('read model shows a masked number, never the plaintext', async () => {
		const f = await makeProperty(db, [['Std', 10000, 2]]);
		const a = await book(f);
		const before = await executeQuery(GetReservation, getReservation, { reservationId: a.reservationId }, ctx(f));
		expect(before.guest.idDocumentMasked).toBeNull();
		await checkInWith(f, a.reservationId, 0, 'AB1234');
		const after = await executeQuery(GetReservation, getReservation, { reservationId: a.reservationId }, ctx(f));
		expect(after.guest.idDocumentMasked).toBe('••••1234');
		expect(JSON.stringify(after)).not.toContain('AB1234');

		const b = await book(f);
		await checkInWith(f, b.reservationId, 1, '99');
		const short = await executeQuery(GetReservation, getReservation, { reservationId: b.reservationId }, ctx(f));
		expect(short.guest.idDocumentMasked).toBe('••••');
	});

	it('redacts the ID number in the audit event', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const { reservationId } = await checkedInGuest(f, 'X1234567');
		const events = await db.select().from(auditEvent).where(eq(auditEvent.reservationId, reservationId));
		const ev = events.find((e) => e.command === CheckIn.name);
		expect(ev).toBeDefined();
		expect((ev!.input as Record<string, unknown>).idDocumentNumber).toBe('[redacted]');
		const serialized = JSON.stringify(ev);
		expect(serialized).not.toContain('X1234567');
		expect(serialized).not.toContain('1234567');
		expect(serialized).not.toContain('v1:');
	});

	it('rejects plaintext ID numbers at the database (23514)', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const { guestId } = await checkedInGuest(f, 'X1234567');
		const err = await db.execute(sql`UPDATE guest SET id_document_number = 'PLAIN123' WHERE id = ${guestId}`).then(
			() => null,
			(e: unknown) => e
		);
		expect(err).not.toBeNull();
		expect(pgErrorCode(err)).toBe(PG.CHECK_VIOLATION);
		expect(JSON.stringify((err as { cause?: unknown; message?: string }).cause ?? (err as Error).message)).toContain('guest_id_document_number_encrypted');
	});

	it('backfill encrypts legacy plaintext and is idempotent', async () => {
		const f = await makeProperty(db, [['Std', 10000, 2]]);
		// Committed fixtures first (outside the DDL transaction).
		const r1 = await book(f);
		const r2 = await book(f);
		const g1 = await guestIdOf(r1.reservationId);
		const g2 = await guestIdOf(r2.reservationId);
		const other = await makeProperty(db, [['Std', 10000, 1]]);
		const gOut = await guestIdOf((await book(other)).reservationId);
		const rollback = new Error('rollback');

		const outcome = await db
			.transaction(async (tx) => {
				await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
				await tx.execute(sql.raw('ALTER TABLE "guest" DROP CONSTRAINT "guest_id_document_number_encrypted"'));
				await tx.execute(sql`UPDATE guest SET id_document_number = 'P7654321', id_document_last4 = NULL WHERE id = ${g1}`);
				await tx.execute(sql`UPDATE guest SET id_document_number = '99', id_document_last4 = NULL WHERE id = ${g2}`);
				await tx.execute(sql`UPDATE guest SET id_document_number = 'OUTSIDE99', id_document_last4 = NULL WHERE id = ${gOut}`);
				await tx.execute(
					sql.raw(
						`ALTER TABLE "guest" ADD CONSTRAINT "guest_id_document_number_encrypted" CHECK ("id_document_number" IS NULL OR "id_document_number" ~ '^v1:[A-Za-z0-9_-]{1,32}:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$') NOT VALID`
					)
				);

				const run1 = await reencryptIdDocuments(tx, ringK1, { propertyId: f.propertyId });
				const rows = (await tx.execute(
					sql`SELECT id, id_document_number AS num, id_document_last4 AS last4 FROM guest WHERE id IN (${g1}, ${g2})`
				)) as unknown as { id: string; num: string; last4: string | null }[];
				const outsideRow = (await tx.execute(sql`SELECT id_document_number AS num FROM guest WHERE id = ${gOut}`)) as unknown as { num: string }[];
				const run2 = await reencryptIdDocuments(tx, ringK1, { propertyId: f.propertyId });
				const probe = (await tx.execute(sql`SELECT 1 AS ok`)) as unknown as { ok: number }[];
				await tx.execute(sql`UPDATE guest SET id_document_number = NULL WHERE id = ${gOut}`);
				const run3 = await reencryptIdDocuments(tx, ringK1, { propertyId: f.propertyId });
				const out = { run1, run2, run3, rows, outsideNum: outsideRow[0]!.num, probe };
				throw Object.assign(rollback, { out });
			})
			.catch((e: unknown) => {
				if (e !== rollback) throw e;
				return (e as unknown as { out: unknown }).out as {
					run1: Awaited<ReturnType<typeof reencryptIdDocuments>>;
					run2: Awaited<ReturnType<typeof reencryptIdDocuments>>;
					run3: Awaited<ReturnType<typeof reencryptIdDocuments>>;
					rows: { id: string; num: string; last4: string | null }[];
					outsideNum: string;
					probe: { ok: number }[];
				};
			});

		expect(outcome.run1.encrypted).toBe(2);
		expect(outcome.run1.failed).toEqual([]);
		const byId = new Map(outcome.rows.map((r) => [r.id, r]));
		const a = byId.get(g1)!;
		const b = byId.get(g2)!;
		expect(a.num).toMatch(ENVELOPE_RE);
		expect(b.num).toMatch(ENVELOPE_RE);
		expect(decryptField(ringK1, a.num, `guest:${g1}`)).toBe('P7654321');
		expect(decryptField(ringK1, b.num, `guest:${g2}`)).toBe('99');
		expect(a.last4).toBe('4321');
		expect(b.last4).toBeNull();
		// Out-of-scope plaintext makes the nested VALIDATE fail (23514): caught, outer tx still usable, scope respected.
		expect(outcome.run1.validated).toBe(false);
		expect(outcome.outsideNum).toBe('OUTSIDE99');
		expect(outcome.probe[0]!.ok).toBe(1);
		expect(outcome.run2.encrypted).toBe(0);
		expect(outcome.run2.rotated).toBe(0);
		// Once nothing plaintext remains anywhere, the scoped run validates the constraint.
		expect(outcome.run3.validated).toBe(true);

		// Rolled back: schema restored (constraint present again), rows untouched.
		const con = (await db.execute(
			sql`SELECT convalidated FROM pg_constraint WHERE conname = 'guest_id_document_number_encrypted' AND conrelid = 'guest'::regclass`
		)) as unknown as { convalidated: boolean }[];
		expect(con).toHaveLength(1);
		expect((await rawGuest(g1)).num).toBeNull();
	});

	it('rotates envelopes to the new active key and keeps old ones decryptable', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const { guestId } = await checkedInGuest(f, 'X1234567');
		const old = (await rawGuest(guestId)).num!;
		expect(old.split(':')[1]).toBe('test');

		const run = await reencryptIdDocuments(db, ringK2, { propertyId: f.propertyId });
		expect(run.rotated).toBe(1);
		expect(run.encrypted).toBe(0);
		expect(run.failed).toEqual([]);
		expect(run.remaining).toBe(0);

		const now = await rawGuest(guestId);
		expect(now.num).toMatch(ENVELOPE_RE);
		expect(now.num!.split(':')[1]).toBe('k2');
		expect(decryptField(ringK2, now.num!, `guest:${guestId}`)).toBe('X1234567');
		expect(now.last4).toBe('4567');
		expect(decryptField(ringK2, old, `guest:${guestId}`)).toBe('X1234567');

		const again = await reencryptIdDocuments(db, ringK2, { propertyId: f.propertyId });
		expect(again.rotated).toBe(0);
		expect(again.remaining).toBe(0);
	});

	it('rotates online: a locked row is skipped, check-in is not blocked, rerun finishes', async () => {
		const f = await makeProperty(db, [['Std', 10000, 3]]);
		const one = await checkedInGuest(f, 'AAA11111', 0);
		const two = await checkedInGuest(f, 'BBB22222', 1);
		const third = await book(f);

		let release!: () => void;
		let locked!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const lockedP = new Promise<void>((r) => (locked = r));
		const holder = db.transaction(async (tx) => {
			await tx.execute(sql`SELECT id FROM guest WHERE id = ${one.guestId} FOR UPDATE`);
			locked();
			await gate;
		});
		await lockedP;
		try {
			const t0 = Date.now();
			const run = await reencryptIdDocuments(db, ringK2, { propertyId: f.propertyId });
			expect(Date.now() - t0).toBeLessThan(4000);
			expect(run.rotated).toBe(1);
			expect(run.remaining).toBe(1);
			expect((await rawGuest(two.guestId)).num!.split(':')[1]).toBe('k2');
			expect((await rawGuest(one.guestId)).num!.split(':')[1]).toBe('test');

			// Front desk keeps working on the same property while the row is locked.
			await expect(checkInWith(f, third.reservationId, 2, 'CCC33333')).resolves.toMatchObject({ reservationId: third.reservationId });
		} finally {
			release();
			await holder;
		}

		const rerun = await reencryptIdDocuments(db, ringK2, { propertyId: f.propertyId });
		// the late check-in was written under the old key, so it rotates too
		expect(rerun.rotated).toBe(2);
		expect(rerun.remaining).toBe(0);
		expect(rerun.failed).toEqual([]);
		expect(decryptField(ringK2, (await rawGuest(one.guestId)).num!, `guest:${one.guestId}`)).toBe('AAA11111');
	});

	it('reports rows whose key is missing and leaves them unchanged', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const { guestId } = await checkedInGuest(f, 'X1234567');
		const before = await rawGuest(guestId);
		const stateBefore = (await db.execute(
			sql`SELECT convalidated FROM pg_constraint WHERE conname = 'guest_id_document_number_encrypted' AND conrelid = 'guest'::regclass`
		)) as unknown as { convalidated: boolean }[];

		const run = await reencryptIdDocuments(db, ringK3Only as PiiKeyring, { propertyId: f.propertyId });
		expect(run.failed.map((x) => x.guestId)).toEqual([guestId]);
		expect(run.rotated).toBe(0);
		expect(run.encrypted).toBe(0);
		expect(run.remaining).toBe(1);
		expect(await rawGuest(guestId)).toEqual(before);
		// validated mirrors the pre-existing constraint state; a failed run never flips it.
		expect(run.validated).toBe(stateBefore[0]!.convalidated);
	});
});
