/** PR-15 multi-room bookings · PR-16 rate plans · PR-17 tax model — against a real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { DB } from './db/client';
import { booking, folioItemTax, reservation, roomInventoryDaily } from './db/schema';
import { executeCommand, executePublicCommand, executePublicQuery, executeQuery } from './cqrs/execute';
import { DomainError } from './cqrs/errors';
import { guest, makeProperty, NOW, openTestDb, TEST_DB_URL, TEST_PII_KEYRING, TODAY, type Fixture } from './testkit';
import { addDays } from '$lib/shared/domain/dates';
import { UpsertTaxRule } from '$lib/features/setup/upsert-tax-rule/contract';
import { upsertTaxRule } from '$lib/features/setup/upsert-tax-rule/handler.server';
import { UpsertRatePlan } from '$lib/features/setup/upsert-rate-plan/contract';
import { upsertRatePlan } from '$lib/features/setup/upsert-rate-plan/handler.server';
import { BulkUpdateRatePlan } from '$lib/features/inventory/bulk-update-rate-plan/contract';
import { bulkUpdateRatePlan } from '$lib/features/inventory/bulk-update-rate-plan/handler.server';
import { SearchAvailability } from '$lib/features/booking-engine/search-availability/contract';
import { searchAvailability } from '$lib/features/booking-engine/search-availability/handler.server';
import { CreateBooking } from '$lib/features/booking-engine/create-booking/contract';
import { createBooking } from '$lib/features/booking-engine/create-booking/handler.server';
import { GetConfirmation } from '$lib/features/booking-engine/get-confirmation/contract';
import { getConfirmation } from '$lib/features/booking-engine/get-confirmation/handler.server';
import { CheckIn } from '$lib/features/front-desk/check-in/contract';
import { makeCheckIn } from '$lib/features/front-desk/check-in/handler.server';
import { PostCharge } from '$lib/features/folio/post-charge/contract';
import { postCharge } from '$lib/features/folio/post-charge/handler.server';
import { VoidItem } from '$lib/features/folio/void-item/contract';
import { voidItem } from '$lib/features/folio/void-item/handler.server';
import { RunNightAudit } from '$lib/features/folio/run-night-audit/contract';
import { runNightAudit } from '$lib/features/folio/run-night-audit/handler.server';
import { GetFolioLedger } from '$lib/features/folio/get-folio-ledger/contract';
import { getFolioLedger } from '$lib/features/folio/get-folio-ledger/handler.server';
import { ModifyReservation } from '$lib/features/reservations/modify-reservation/contract';
import { modifyReservation } from '$lib/features/reservations/modify-reservation/handler.server';

const checkIn = makeCheckIn(() => TEST_PII_KEYRING);

let db: DB;
let close: () => Promise<void>;
beforeAll(() => {
	if (TEST_DB_URL) ({ db, close } = openTestDb());
});
afterAll(async () => close?.());

const ctx = (f: Fixture) => ({ db, actor: f.admin, now: NOW });
async function code(p: Promise<unknown>) {
	const e = await p.then(() => null, (x: unknown) => x);
	expect(e).toBeInstanceOf(DomainError);
	return (e as DomainError).code;
}
const book = (f: Fixture, rooms: { roomTypeId: string; ratePlanId?: string | null; adults: number; children?: number }[], expectedTotalCents: number, checkIn = '2030-05-01', checkOut = '2030-05-03') =>
	executePublicCommand(CreateBooking, createBooking, { property: f.slug, checkIn, checkOut, rooms, guest, expectedTotalCents }, { db, now: NOW });

/** Fixture with explicit tax rules (replacing the legacy 10%). */
async function taxedProperty(units = 2) {
	const f = await makeProperty(db, [['Std', 10000, units]]);
	await db.execute(`UPDATE property SET tax_rate_bp = 0 WHERE id = '${f.propertyId}'`);
	await executeCommand(UpsertTaxRule, upsertTaxRule, { name: 'VAT', kind: 'PERCENT', rateBp: 1000, appliesTo: 'ALL' }, ctx(f));
	await executeCommand(UpsertTaxRule, upsertTaxRule, { name: 'City tax', kind: 'PER_PERSON_NIGHT', amountCents: 250, appliesTo: 'ROOM' }, ctx(f));
	return f;
}

describe.skipIf(!TEST_DB_URL)('pricing, taxes & bookings (integration)', () => {
	it('PR-17 quotes and posts multiple taxes with a per-line breakdown; voids mirror it', async () => {
		const f = await taxedProperty();
		const nightTotal = 10000 + 1000 + 2 * 250; // VAT 10% + city tax 2 guests
		const created = await book(f, [{ roomTypeId: f.types[0]!.id, adults: 2 }], 2 * nightTotal, TODAY, addDays(TODAY, 2));
		const [res] = await db.select().from(reservation).where(eq(reservation.confirmationCode, created.rooms[0]!.confirmationCode));

		const { folioId } = await executeCommand(CheckIn, checkIn, { reservationId: res!.id, roomUnitId: f.types[0]!.units[0]!.id, idDocumentType: 'ID', idDocumentNumber: '1' }, ctx(f));
		await executeCommand(RunNightAudit, runNightAudit, {}, ctx(f));
		const beer = await executeCommand(PostCharge, postCharge, { folioId, quantity: 2, line: { kind: 'custom', category: 'MINIBAR', description: 'Beer', unitPriceCents: 500, taxable: true } }, ctx(f));
		expect(beer.totalCents).toBe(1100); // POS: VAT only, no city tax

		const ledger = await executeQuery(GetFolioLedger, getFolioLedger, { reservationId: res!.id }, ctx(f));
		const fo = ledger.folios[0]!;
		const roomLine = fo.items.find((i) => i.type === 'ROOM')!;
		expect(roomLine).toMatchObject({ amountCents: 10000, taxCents: 1500, totalCents: 11500 });
		const lines = await db.select().from(folioItemTax).where(eq(folioItemTax.folioItemId, roomLine.id));
		expect(lines.map((l) => [l.name, l.amountCents]).sort()).toEqual([['City tax', 500], ['VAT', 1000]]);
		expect(fo.taxSummary).toEqual(expect.arrayContaining([{ name: 'VAT', amountCents: 1100 }, { name: 'City tax', amountCents: 500 }]));

		await executeCommand(VoidItem, voidItem, { itemId: beer.itemId, reason: 'wrong room' }, ctx(f));
		const after = await executeQuery(GetFolioLedger, getFolioLedger, { reservationId: res!.id }, ctx(f));
		expect(after.folios[0]!.taxSummary).toEqual(expect.arrayContaining([{ name: 'VAT', amountCents: 1000 }, { name: 'City tax', amountCents: 500 }]));
		await expect(db.delete(folioItemTax).where(eq(folioItemTax.folioItemId, roomLine.id))).rejects.toBeTruthy(); // append-only
	});

	it('PR-17 price-inclusive VAT keeps the sticker price', async () => {
		const f = await makeProperty(db, [['Std', 11200, 1]]);
		await db.execute(`UPDATE property SET tax_rate_bp = 0 WHERE id = '${f.propertyId}'`);
		await executeCommand(UpsertTaxRule, upsertTaxRule, { name: 'VAT', kind: 'PERCENT', rateBp: 1200, inclusive: true }, ctx(f));
		const s = await executePublicQuery(SearchAvailability, searchAvailability, { property: f.slug, checkIn: '2030-05-01', checkOut: '2030-05-02', adults: '1' }, { db, now: NOW });
		expect(s.offers[0]!.quote).toMatchObject({ subtotalCents: 10000, taxCents: 1200, totalCents: 11200 });
	});

	it('PR-16 sells several rate plans with derived prices, extra-guest charges and plan stop-sell', async () => {
		const f = await makeProperty(db, [['Std', 10000, 3]]); // legacy 10% tax
		const t = f.types[0]!.id;
		const flex = await executeCommand(UpsertRatePlan, upsertRatePlan, { roomTypeId: t, name: 'Flexible', code: 'FLEX', includedOccupancy: 2, extraAdultCents: 3000, isDefault: true }, ctx(f));
		const nr = await executeCommand(UpsertRatePlan, upsertRatePlan, { roomTypeId: t, name: 'Non-refundable', code: 'NR', adjustmentKind: 'PERCENT', adjustmentValue: -1500, includedOccupancy: 2, extraAdultCents: 3000, refundable: false }, ctx(f));

		const s = await executePublicQuery(SearchAvailability, searchAvailability, { property: f.slug, checkIn: '2030-05-01', checkOut: '2030-05-03', adults: '3' }, { db, now: NOW });
		const byPlan = Object.fromEntries(s.offers.map((o) => [o.plan.name, o.quote.nights.map((n) => n.rateCents)]));
		expect(byPlan).toEqual({ Flexible: [13000, 13000], 'Non-refundable': [11500, 11500] });

		await executeCommand(BulkUpdateRatePlan, bulkUpdateRatePlan, { ratePlanId: nr.ratePlanId, from: '2030-05-02', to: '2030-05-02', isClosed: true }, ctx(f));
		expect(await code(book(f, [{ roomTypeId: t, ratePlanId: nr.ratePlanId, adults: 2 }], 0))).toBe('CONFLICT');
		const ok = await book(f, [{ roomTypeId: t, ratePlanId: flex.ratePlanId, adults: 2 }], 2 * 11000);
		const [res] = await db.select().from(reservation).where(eq(reservation.confirmationCode, ok.rooms[0]!.confirmationCode));
		expect(res!.ratePlanId).toBe(flex.ratePlanId);

		// party change re-prices every night (extra adult)
		const m = await executeCommand(ModifyReservation, modifyReservation, { reservationId: res!.id, adults: 3 }, ctx(f));
		expect(m.quotedTotalCents).toBe(2 * 14300);
	});

	it('PR-15 books several rooms atomically under one booking code', async () => {
		const f = await makeProperty(db, [['Std', 10000, 2], ['Dlx', 20000, 1]]);
		const [std, dlx] = [f.types[0]!.id, f.types[1]!.id];
		const ok = await book(f, [{ roomTypeId: dlx, adults: 2 }, { roomTypeId: std, adults: 1 }], 2 * 22000 + 2 * 11000);
		expect(ok.rooms).toHaveLength(2);
		const rows = await db.select().from(reservation).where(eq(reservation.propertyId, f.propertyId));
		expect(new Set(rows.map((r) => r.bookingId)).size).toBe(1);
		expect(new Set(rows.map((r) => r.guestId)).size).toBe(1);

		const conf = await executePublicQuery(GetConfirmation, getConfirmation, { property: f.slug, code: ok.confirmationCode, lastName: 'cruz' }, { db, now: NOW });
		expect(conf.rooms.map((r) => r.roomTypeName).sort()).toEqual(['Dlx', 'Std']);
		expect(conf.totalCents).toBe(ok.totalCents);

		// 2 Std rooms when only 1 left → nothing is created (all-or-nothing)
		const before = await db.select().from(booking).where(eq(booking.propertyId, f.propertyId));
		expect(await code(book(f, [{ roomTypeId: std, adults: 1 }, { roomTypeId: std, adults: 1 }], 0))).toBe('CONFLICT');
		const after = await db.select().from(booking).where(eq(booking.propertyId, f.propertyId));
		expect(after).toHaveLength(before.length);
		const inv = await db.select().from(roomInventoryDaily).where(and(eq(roomInventoryDaily.roomTypeId, std), eq(roomInventoryDaily.date, '2030-05-01')));
		expect(inv[0]!.soldCount).toBe(1);
	});

	it('PR-15 concurrent multi-room bookings never oversell', async () => {
		const f = await makeProperty(db, [['Std', 10000, 3], ['Dlx', 20000, 3]]);
		const [std, dlx] = [f.types[0]!.id, f.types[1]!.id];
		const total = 2 * 11000 * 2 + 2 * 22000;
		// Each wants 2 Std + 1 Dlx; only one of them fits in 3 Std units… plus one more Std. Opposite input order exercises lock ordering.
		const results = await Promise.allSettled([
			book(f, [{ roomTypeId: std, adults: 1 }, { roomTypeId: std, adults: 1 }, { roomTypeId: dlx, adults: 1 }], total),
			book(f, [{ roomTypeId: dlx, adults: 1 }, { roomTypeId: std, adults: 1 }, { roomTypeId: std, adults: 1 }], total),
			book(f, [{ roomTypeId: std, adults: 1 }, { roomTypeId: dlx, adults: 1 }, { roomTypeId: std, adults: 1 }], total)
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const inv = await db.select().from(roomInventoryDaily).where(eq(roomInventoryDaily.date, '2030-05-01'));
		expect(inv.find((r) => r.roomTypeId === std)!.soldCount).toBe(2);
		expect(inv.find((r) => r.roomTypeId === dlx)!.soldCount).toBe(1);
	});
});
