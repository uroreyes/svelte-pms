/**
 * End-to-end slice tests against a real Postgres (TEST_DATABASE_URL, migrated).
 * Each test builds its own property → tenant isolation means no truncation is needed
 * (ledger tables are append-only by trigger, so they cannot be truncated anyway).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { createDb, type DB } from './db/client';
import { folio, folioItem, property, reservation, roomInventoryDaily, roomType, roomUnit, staffUser } from './db/schema';
import { executeCommand, executePublicCommand, executeQuery } from './cqrs/execute';
import { DomainError } from './cqrs/errors';
import type { Actor } from './cqrs/actor';
import { CreateBooking } from '$lib/features/booking-engine/create-booking/contract';
import { createBooking } from '$lib/features/booking-engine/create-booking/handler.server';
import { CreateReservation } from '$lib/features/reservations/create-reservation/contract';
import { createFrontDeskReservation } from '$lib/features/reservations/create-reservation/handler.server';
import { AssignRoom } from '$lib/features/reservations/assign-room/contract';
import { assignRoom } from '$lib/features/reservations/assign-room/handler.server';
import { CancelReservation } from '$lib/features/reservations/cancel-reservation/contract';
import { cancelReservationHandler } from '$lib/features/reservations/cancel-reservation/handler.server';
import { GetReservation } from '$lib/features/reservations/get-reservation/contract';
import { getReservation } from '$lib/features/reservations/get-reservation/handler.server';
import { BulkUpdateInventory } from '$lib/features/inventory/bulk-update-inventory/contract';
import { bulkUpdateInventory } from '$lib/features/inventory/bulk-update-inventory/handler.server';
import { SetDailyInventory } from '$lib/features/inventory/set-daily-inventory/contract';
import { setDailyInventory } from '$lib/features/inventory/set-daily-inventory/handler.server';
import { CheckIn } from '$lib/features/front-desk/check-in/contract';
import { makeCheckIn } from '$lib/features/front-desk/check-in/handler.server';
import { TEST_PII_KEYRING } from './testkit';
import { CheckOut } from '$lib/features/front-desk/check-out/contract';
import { checkOut } from '$lib/features/front-desk/check-out/handler.server';
import { PostCharge } from '$lib/features/folio/post-charge/contract';
import { postCharge } from '$lib/features/folio/post-charge/handler.server';
import { VoidItem } from '$lib/features/folio/void-item/contract';
import { voidItem } from '$lib/features/folio/void-item/handler.server';
import { RecordPayment } from '$lib/features/folio/record-payment/contract';
import { recordPayment } from '$lib/features/folio/record-payment/handler.server';
import { OpenSplitFolio } from '$lib/features/folio/open-split-folio/contract';
import { openSplitFolio } from '$lib/features/folio/open-split-folio/handler.server';
import { TransferItem } from '$lib/features/folio/transfer-item/contract';
import { transferItem } from '$lib/features/folio/transfer-item/handler.server';
import { RunNightAudit } from '$lib/features/folio/run-night-audit/contract';
import { runNightAudit } from '$lib/features/folio/run-night-audit/handler.server';
import { GetFolioLedger } from '$lib/features/folio/get-folio-ledger/contract';
import { getFolioLedger } from '$lib/features/folio/get-folio-ledger/handler.server';
import { IngestOtaReservation } from '$lib/features/channels/ingest-ota-webhook/contract';
import { ingestOtaReservation } from '$lib/features/channels/ingest-ota-webhook/handler.server';
import { UpsertChannelMapping } from '$lib/features/channels/upsert-mapping/contract';
import { upsertChannelMapping } from '$lib/features/channels/upsert-mapping/handler.server';
import { SearchAvailability } from '$lib/features/booking-engine/search-availability/contract';
import { searchAvailability } from '$lib/features/booking-engine/search-availability/handler.server';
import { executePublicQuery } from './cqrs/execute';

const url = process.env.TEST_DATABASE_URL;
const NOW = new Date('2030-03-01T12:00:00Z'); // property timezone is UTC → business date 2030-03-01
const TODAY = '2030-03-01';

const checkIn = makeCheckIn(() => TEST_PII_KEYRING);

let db: DB;
let close: () => Promise<void>;

beforeAll(() => {
	if (!url) return;
	({ db, close } = createDb(url, { max: 12 }));
});
afterAll(async () => close?.());

interface Fixture {
	slug: string;
	propertyId: string;
	admin: Actor;
	roomTypeId: string;
	units: { id: string; roomNumber: string }[];
}

async function fixture(unitCount: number, opts: { mode?: 'UPFRONT' | 'NIGHTLY' } = {}): Promise<Fixture> {
	const slug = `t-${randomUUID().slice(0, 12)}`;
	const [p] = await db.insert(property).values({ slug, name: `Test ${slug}`, timezone: 'UTC', taxRateBp: 1000, roomPostingMode: opts.mode ?? 'NIGHTLY' }).returning();
	const [u] = await db.insert(staffUser).values({ propertyId: p!.id, email: `${slug}@t.test`, name: 'Tess Admin', role: 'ADMIN', passwordHash: 'x' }).returning();
	const [t] = await db.insert(roomType).values({ propertyId: p!.id, name: 'Deluxe', baseRateCents: 10000, baseOccupancy: 2, maxOccupancy: 3 }).returning();
	const units = unitCount
		? await db
				.insert(roomUnit)
				.values(Array.from({ length: unitCount }, (_, i) => ({ propertyId: p!.id, roomTypeId: t!.id, roomNumber: String(101 + i) })))
				.returning({ id: roomUnit.id, roomNumber: roomUnit.roomNumber })
		: [];
	return { slug, propertyId: p!.id, roomTypeId: t!.id, units, admin: { userId: u!.id, propertyId: p!.id, role: 'ADMIN', name: u!.name, email: u!.email } };
}

const guest = { firstName: 'Ana', lastName: 'Cruz', email: 'ana@example.com' };

function book(f: Fixture, checkIn: string, checkOut: string, expectedTotalCents: number) {
	return executePublicCommand(CreateBooking, createBooking, { property: f.slug, checkIn, checkOut, rooms: [{ roomTypeId: f.roomTypeId, adults: 2 }], guest, expectedTotalCents }, { db, now: NOW });
}

async function expectDomainError(p: Promise<unknown>, code: string) {
	const err = await p.then(
		() => null,
		(e: unknown) => e
	);
	expect(err, `expected ${code}`).toBeInstanceOf(DomainError);
	expect((err as DomainError).code).toBe(code);
	return err as DomainError;
}

describe.skipIf(!url)('PMS slices (integration)', () => {
	it('prevents double-booking the last room under concurrency (SELECT … FOR UPDATE)', async () => {
		const f = await fixture(1);
		const total = 2 * 11000; // 2 nights × (100 + 10% tax)
		const results = await Promise.allSettled(Array.from({ length: 8 }, () => book(f, '2030-03-10', '2030-03-12', total)));
		const ok = results.filter((r) => r.status === 'fulfilled');
		const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
		expect(ok).toHaveLength(1);
		expect(rejected.every((r) => r.reason instanceof DomainError && r.reason.code === 'CONFLICT')).toBe(true);
		const rows = await db.select().from(roomInventoryDaily).where(eq(roomInventoryDaily.roomTypeId, f.roomTypeId));
		expect(rows.map((r) => [r.date, r.soldCount]).sort()).toEqual([
			['2030-03-10', 1],
			['2030-03-11', 1]
		]);
	});

	it('uses half-open stays: back-to-back bookings share one unit', async () => {
		const f = await fixture(1);
		await book(f, '2030-05-10', '2030-05-12', 22000);
		await expect(book(f, '2030-05-12', '2030-05-14', 22000)).resolves.toMatchObject({ confirmationCode: expect.any(String) });
		await expectDomainError(book(f, '2030-05-11', '2030-05-13', 22000), 'CONFLICT');
	});

	it('re-quotes server-side and rejects a stale client price', async () => {
		const f = await fixture(2);
		const e = await expectDomainError(book(f, '2030-04-01', '2030-04-02', 1), 'CONFLICT');
		expect(e.details).toEqual({ totalCents: 11000 });
	});

	it('bulk-updates Fri/Sat only and refuses to drop availability below sold', async () => {
		const f = await fixture(3);
		const r = await executeCommand(
			BulkUpdateInventory,
			bulkUpdateInventory,
			{ roomTypeId: f.roomTypeId, from: '2030-12-01', to: '2030-12-31', daysOfWeek: [5, 6], patch: { rateOverrideCents: 15000, availableCount: 8 } },
			{ db, actor: f.admin, now: NOW }
		);
		expect(r.updated).toBe(8);
		const search = await executePublicQuery(SearchAvailability, searchAvailability, { property: f.slug, checkIn: '2030-12-05', checkOut: '2030-12-08', adults: '2' }, { db, now: NOW });
		// Thu 100, Fri 150, Sat 150
		expect(search.offers[0]!.quote.nights.map((n) => n.rateCents)).toEqual([10000, 15000, 15000]);

		await book(f, '2030-12-06', '2030-12-07', 16500);
		await book(f, '2030-12-06', '2030-12-07', 16500);
		await expectDomainError(
			executeCommand(SetDailyInventory, setDailyInventory, { roomTypeId: f.roomTypeId, date: '2030-12-06', patch: { availableCount: 1 } }, { db, actor: f.admin, now: NOW }),
			'CONFLICT'
		);
		await executeCommand(SetDailyInventory, setDailyInventory, { roomTypeId: f.roomTypeId, date: '2030-12-06', patch: { isClosed: true } }, { db, actor: f.admin, now: NOW });
		await expectDomainError(book(f, '2030-12-06', '2030-12-07', 16500), 'CONFLICT');
	});

	it('enforces MinLOS on arrival', async () => {
		const f = await fixture(2);
		await executeCommand(SetDailyInventory, setDailyInventory, { roomTypeId: f.roomTypeId, date: '2030-06-01', patch: { minLos: 3 } }, { db, actor: f.admin, now: NOW });
		const e = await expectDomainError(book(f, '2030-06-01', '2030-06-03', 22000), 'CONFLICT');
		expect(e.details).toMatchObject({ reason: 'MIN_LOS' });
		await expect(book(f, '2030-06-01', '2030-06-04', 33000)).resolves.toBeTruthy();
	});

	it('blocks allocating one physical room to overlapping stays (exclusion constraint + guard)', async () => {
		const f = await fixture(2);
		const ctx = { db, actor: f.admin, now: NOW };
		const a = await executeCommand(CreateReservation, createFrontDeskReservation, { roomTypeId: f.roomTypeId, checkIn: '2030-07-01', checkOut: '2030-07-04', adults: 1, guest }, ctx);
		const b = await executeCommand(CreateReservation, createFrontDeskReservation, { roomTypeId: f.roomTypeId, checkIn: '2030-07-03', checkOut: '2030-07-05', adults: 1, guest }, ctx);
		await executeCommand(AssignRoom, assignRoom, { reservationId: a.reservationId, roomUnitId: f.units[0]!.id }, ctx);
		await expectDomainError(executeCommand(AssignRoom, assignRoom, { reservationId: b.reservationId, roomUnitId: f.units[0]!.id }, ctx), 'CONFLICT');
		// Even bypassing the app guard, Postgres refuses.
		await expect(db.update(reservation).set({ roomUnitId: f.units[0]!.id }).where(eq(reservation.id, b.reservationId))).rejects.toMatchObject({
			cause: expect.objectContaining({ code: '23P01' })
		});
	});

	it('runs the full stay: check-in → POS charge → void → split → night audit → settle → check-out', async () => {
		const f = await fixture(2);
		const ctx = { db, actor: f.admin, now: NOW };
		const r = await executeCommand(CreateReservation, createFrontDeskReservation, { roomTypeId: f.roomTypeId, checkIn: TODAY, checkOut: '2030-03-03', adults: 2, guest }, ctx);

		// Room must be clean
		await db.update(roomUnit).set({ housekeepingStatus: 'DIRTY' }).where(eq(roomUnit.id, f.units[0]!.id));
		await expectDomainError(executeCommand(CheckIn, checkIn, { reservationId: r.reservationId, roomUnitId: f.units[0]!.id, idDocumentType: 'Passport', idDocumentNumber: 'X1234567' }, ctx), 'CONFLICT');

		const { folioId } = await executeCommand(CheckIn, checkIn, { reservationId: r.reservationId, roomUnitId: f.units[1]!.id, idDocumentType: 'Passport', idDocumentNumber: 'X1234567' }, ctx);
		const detail = await executeQuery(GetReservation, getReservation, { reservationId: r.reservationId }, ctx);
		expect(detail.guest.idDocumentMasked).toBe('••••4567');

		// POS order: 2 × 7.00 + 10% tax = 15.40
		const charge = await executeCommand(PostCharge, postCharge, { folioId, quantity: 2, line: { kind: 'custom', category: 'MINIBAR', description: 'Beer', unitPriceCents: 700, taxable: true } }, ctx);
		expect(charge.totalCents).toBe(1540);
		const bad = await executeCommand(PostCharge, postCharge, { folioId, line: { kind: 'custom', category: 'F&B', description: 'Wrong room', unitPriceCents: 5000, taxable: true } }, ctx);
		await executeCommand(VoidItem, voidItem, { itemId: bad.itemId, reason: 'Posted to wrong room' }, ctx);
		await expectDomainError(executeCommand(VoidItem, voidItem, { itemId: bad.itemId, reason: 'again' }, ctx), 'CONFLICT');

		// Ledger is append-only at the DB level
		await expect(db.delete(folioItem).where(eq(folioItem.id, bad.itemId))).rejects.toBeTruthy();
		await expect(db.update(folioItem).set({ totalCents: 0 }).where(eq(folioItem.id, charge.itemId))).rejects.toBeTruthy();

		// Company pays room: open split folio routing room nights
		const { folioId: companyFolio } = await executeCommand(OpenSplitFolio, openSplitFolio, { reservationId: r.reservationId, label: 'Company', payerName: 'Acme', routeRoomCharges: true }, ctx);

		// Night audit is idempotent
		const a1 = await executeCommand(RunNightAudit, runNightAudit, {}, ctx);
		const a2 = await executeCommand(RunNightAudit, runNightAudit, {}, ctx);
		expect(a1.posted).toBeGreaterThanOrEqual(1);
		expect(a2.posted).toBe(0);
		await executeCommand(RunNightAudit, runNightAudit, { businessDate: '2030-03-02' }, ctx);

		// Move the beer to the company folio too, then back is not needed — just verify transfer math
		await executeCommand(TransferItem, transferItem, { itemId: charge.itemId, targetFolioId: companyFolio, reason: 'Company covers minibar' }, ctx);

		let ledger = await executeQuery(GetFolioLedger, getFolioLedger, { reservationId: r.reservationId }, ctx);
		const guestF = ledger.folios.find((x) => x.id === folioId)!;
		const companyF = ledger.folios.find((x) => x.id === companyFolio)!;
		expect(guestF.balanceCents).toBe(0); // beer moved out, wrong-room charge voided
		expect(companyF.balanceCents).toBe(2 * 11000 + 1540);
		expect(ledger.unpostedNights).toEqual([]);

		// Checkout requires zero balance
		const e = await expectDomainError(executeCommand(CheckOut, checkOut, { reservationId: r.reservationId }, ctx), 'CONFLICT');
		expect(e.details).toMatchObject({ reason: 'BALANCE_NOT_ZERO' });
		await expectDomainError(executeCommand(RecordPayment, recordPayment, { folioId: companyFolio, method: 'TRANSFER', amountCents: 999_999 }, ctx), 'CONFLICT');
		await executeCommand(RecordPayment, recordPayment, { folioId: companyFolio, method: 'TRANSFER', amountCents: 10_000, referenceNo: 'PO-1' }, ctx);
		await executeCommand(CheckOut, checkOut, { reservationId: r.reservationId, payments: [{ folioId: companyFolio, method: 'CARD', amountCents: 2 * 11000 + 1540 - 10_000 }] }, ctx);

		ledger = await executeQuery(GetFolioLedger, getFolioLedger, { reservationId: r.reservationId }, ctx);
		expect(ledger.reservationStatus).toBe('CHECKED_OUT');
		expect(ledger.folios.every((x) => x.status === 'SETTLED' && x.balanceCents === 0)).toBe(true);
		const [room] = await db.select().from(roomUnit).where(eq(roomUnit.id, f.units[1]!.id));
		expect(room!.housekeepingStatus).toBe('DIRTY');

		// Projection matches the ledger
		const [check] = await db.execute<{ diff: number }>(sql`
			SELECT count(*)::int AS diff FROM folio f
			WHERE f.reservation_id = ${r.reservationId}
			AND f.total_charges_cents <> (SELECT coalesce(sum(total_cents),0) FROM folio_item i WHERE i.folio_id = f.id)`);
		expect(check!.diff).toBe(0);

		// Settled folios reject new charges
		await expectDomainError(executeCommand(PostCharge, postCharge, { folioId, line: { kind: 'custom', category: 'FEE', description: 'Late', unitPriceCents: 100, taxable: false } }, ctx), 'CONFLICT');
	});

	it('posts the whole stay at check-in in UPFRONT mode', async () => {
		const f = await fixture(1, { mode: 'UPFRONT' });
		const ctx = { db, actor: f.admin, now: NOW };
		const r = await executeCommand(CreateReservation, createFrontDeskReservation, { roomTypeId: f.roomTypeId, checkIn: TODAY, checkOut: '2030-03-04', adults: 1, guest }, ctx);
		const res = await executeCommand(CheckIn, checkIn, { reservationId: r.reservationId, roomUnitId: f.units[0]!.id, idDocumentType: 'ID', idDocumentNumber: '99' }, ctx);
		expect(res.postedNights).toBe(3);
		const [fo] = await db.select().from(folio).where(eq(folio.id, res.folioId));
		expect(fo!.balanceCents).toBe(3 * 11000);
	});

	it('ingests OTA bookings idempotently, flags overbookings, and releases on cancel', async () => {
		const f = await fixture(1);
		const ctx = { db, actor: f.admin, now: NOW };
		const ext = `EXT-${randomUUID().slice(0, 8)}`;
		await executeCommand(UpsertChannelMapping, upsertChannelMapping, { roomTypeId: f.roomTypeId, channelName: 'BOOKING_COM', externalRoomId: ext, active: true }, ctx);
		const ota = (id: string, event: 'NEW' | 'CANCEL' = 'NEW') =>
			executePublicCommand(
				IngestOtaReservation,
				ingestOtaReservation,
				event === 'NEW'
					? { event, channel: 'BOOKING_COM', externalReservationId: id, externalRoomId: ext, checkIn: '2030-08-01', checkOut: '2030-08-03', adults: 2, guest }
					: { event, channel: 'BOOKING_COM', externalReservationId: id, externalRoomId: ext },
				{ db, now: NOW }
			);

		const first = await ota('B-1');
		expect(first).toMatchObject({ outcome: 'CREATED', overbooked: false });
		expect(await ota('B-1')).toMatchObject({ outcome: 'DUPLICATE', reservationId: first.reservationId });

		const second = await ota('B-2'); // only one unit → race lost on the OTA side
		expect(second).toMatchObject({ outcome: 'CREATED', overbooked: true });
		// Direct channel is still protected
		await expectDomainError(book(f, '2030-08-01', '2030-08-02', 11000), 'CONFLICT');

		expect(await ota('B-1', 'CANCEL')).toMatchObject({ outcome: 'CANCELLED' });
		expect(await ota('B-2', 'CANCEL')).toMatchObject({ outcome: 'CANCELLED' });
		const rows = await db.select().from(roomInventoryDaily).where(and(eq(roomInventoryDaily.roomTypeId, f.roomTypeId), eq(roomInventoryDaily.date, '2030-08-01')));
		expect(rows[0]!.soldCount).toBe(0);
		await expect(book(f, '2030-08-01', '2030-08-02', 11000)).resolves.toBeTruthy();
	});

	it('cancelling a direct booking releases inventory', async () => {
		const f = await fixture(1);
		const ctx = { db, actor: f.admin, now: NOW };
		const r = await executeCommand(CreateReservation, createFrontDeskReservation, { roomTypeId: f.roomTypeId, checkIn: '2030-09-01', checkOut: '2030-09-02', adults: 1, guest }, ctx);
		await expectDomainError(book(f, '2030-09-01', '2030-09-02', 11000), 'CONFLICT');
		await executeCommand(CancelReservation, cancelReservationHandler, { reservationId: r.reservationId }, ctx);
		await expect(book(f, '2030-09-01', '2030-09-02', 11000)).resolves.toBeTruthy();
	});

	it('isolates tenants and enforces roles', async () => {
		const a = await fixture(1);
		const b = await fixture(1);
		const r = await executeCommand(CreateReservation, createFrontDeskReservation, { roomTypeId: a.roomTypeId, checkIn: '2030-10-01', checkOut: '2030-10-02', adults: 1, guest }, { db, actor: a.admin, now: NOW });
		await expectDomainError(executeQuery(GetReservation, getReservation, { reservationId: r.reservationId }, { db, actor: b.admin, now: NOW }), 'NOT_FOUND');
		const pos: Actor = { ...a.admin, role: 'POS' };
		await expectDomainError(executeCommand(RecordPayment, recordPayment, { folioId: randomUUID(), method: 'CASH', amountCents: 100 }, { db, actor: pos }), 'FORBIDDEN');
		// POS staff can post charges but must not read guest PII (ID numbers, contact details)
		await expectDomainError(executeQuery(GetReservation, getReservation, { reservationId: r.reservationId }, { db, actor: pos }), 'FORBIDDEN');
		await expectDomainError(executeQuery(GetFolioLedger, getFolioLedger, { reservationId: r.reservationId }, { db, actor: pos }), 'FORBIDDEN');
		await expectDomainError(executeQuery(GetReservation, getReservation, { reservationId: r.reservationId }, { db, actor: null }), 'UNAUTHENTICATED');
		await expectDomainError(executeCommand(CreateReservation, createFrontDeskReservation, { roomTypeId: 'nope' }, { db, actor: a.admin }), 'VALIDATION');
	});
});
