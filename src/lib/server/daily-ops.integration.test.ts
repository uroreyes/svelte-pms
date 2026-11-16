/** PR-07/08/09/10/11/18/19 — front-desk lifecycle against a real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import type { DB } from './db/client';
import { reservation, roomInventoryDaily, roomUnit } from './db/schema';
import { executeCommand, executeQuery } from './cqrs/execute';
import { DomainError } from './cqrs/errors';
import { guest, makeProperty, NOW, openTestDb, TEST_DB_URL, TEST_PII_KEYRING, TODAY, type Fixture } from './testkit';
import { addDays, dateIn } from '$lib/shared/domain/dates';
import { CreateReservation } from '$lib/features/reservations/create-reservation/contract';
import { createFrontDeskReservation } from '$lib/features/reservations/create-reservation/handler.server';
import { ModifyReservation } from '$lib/features/reservations/modify-reservation/contract';
import { modifyReservation } from '$lib/features/reservations/modify-reservation/handler.server';
import { MoveRoom } from '$lib/features/reservations/move-room/contract';
import { moveRoom } from '$lib/features/reservations/move-room/handler.server';
import { MarkNoShow } from '$lib/features/reservations/mark-no-show/contract';
import { markNoShowHandler } from '$lib/features/reservations/mark-no-show/handler.server';
import { AssignRoom } from '$lib/features/reservations/assign-room/contract';
import { assignRoom } from '$lib/features/reservations/assign-room/handler.server';
import { CheckIn } from '$lib/features/front-desk/check-in/contract';
import { makeCheckIn } from '$lib/features/front-desk/check-in/handler.server';
import { CheckOut } from '$lib/features/front-desk/check-out/contract';
import { checkOut } from '$lib/features/front-desk/check-out/handler.server';
import { GetDailyOps } from '$lib/features/front-desk/get-daily-ops/contract';
import { getDailyOps } from '$lib/features/front-desk/get-daily-ops/handler.server';
import { RunNightAudit } from '$lib/features/folio/run-night-audit/contract';
import { runNightAudit } from '$lib/features/folio/run-night-audit/handler.server';
import { RecordPayment } from '$lib/features/folio/record-payment/contract';
import { recordPayment } from '$lib/features/folio/record-payment/handler.server';
import { UpdateFolioBilling } from '$lib/features/folio/update-folio-billing/contract';
import { updateFolioBilling } from '$lib/features/folio/update-folio-billing/handler.server';
import { GetFolioLedger } from '$lib/features/folio/get-folio-ledger/contract';
import { getFolioLedger } from '$lib/features/folio/get-folio-ledger/handler.server';
import { GetCashierReport } from '$lib/features/reports/get-cashier-report/contract';
import { getCashierReport } from '$lib/features/reports/get-cashier-report/handler.server';
import { ExportDataset } from '$lib/features/reports/export-dataset/contract';
import { exportDataset } from '$lib/features/reports/export-dataset/handler.server';

const checkIn = makeCheckIn(() => TEST_PII_KEYRING);

let db: DB;
let close: () => Promise<void>;
beforeAll(() => {
	if (TEST_DB_URL) ({ db, close } = openTestDb());
});
afterAll(async () => close?.());

const ctx = (f: Fixture, now = NOW) => ({ db, actor: f.admin, now });
const create = (f: Fixture, typeIdx: number, checkIn: string, checkOut: string, extra: Record<string, unknown> = {}) =>
	executeCommand(CreateReservation, createFrontDeskReservation, { roomTypeId: f.types[typeIdx]!.id, checkIn, checkOut, adults: 1, guest, ...extra }, ctx(f));
const sold = async (typeId: string, dates: string[]) => {
	const rows = await db.select().from(roomInventoryDaily).where(and(eq(roomInventoryDaily.roomTypeId, typeId), inArray(roomInventoryDaily.date, dates)));
	return Object.fromEntries(dates.map((d) => [d, rows.find((r) => r.date === d)?.soldCount ?? 0]));
};
const getRes = async (id: string) => (await db.select().from(reservation).where(eq(reservation.id, id)))[0]!;
async function code(p: Promise<unknown>) {
	const e = await p.then(() => null, (x: unknown) => x);
	expect(e).toBeInstanceOf(DomainError);
	return (e as DomainError).code;
}

describe.skipIf(!TEST_DB_URL)('daily operations (integration)', () => {
	it('PR-07 modifies dates and room type, moving inventory and keeping the code', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1], ['Dlx', 20000, 1]]);
		const [std, dlx] = [f.types[0]!.id, f.types[1]!.id];
		const r = await create(f, 0, '2030-04-10', '2030-04-12');
		const before = await getRes(r.reservationId);

		// extend by one night
		await executeCommand(ModifyReservation, modifyReservation, { reservationId: r.reservationId, checkOut: '2030-04-13' }, ctx(f));
		expect(await sold(std, ['2030-04-10', '2030-04-11', '2030-04-12'])).toEqual({ '2030-04-10': 1, '2030-04-11': 1, '2030-04-12': 1 });

		// shift + shorten: 11→12 only
		await executeCommand(ModifyReservation, modifyReservation, { reservationId: r.reservationId, checkIn: '2030-04-11', checkOut: '2030-04-12' }, ctx(f));
		expect(await sold(std, ['2030-04-10', '2030-04-11', '2030-04-12'])).toEqual({ '2030-04-10': 0, '2030-04-11': 1, '2030-04-12': 0 });

		// upgrade room type: old type released, new consumed, re-priced, room unassigned
		await executeCommand(AssignRoom, assignRoom, { reservationId: r.reservationId, roomUnitId: f.types[0]!.units[0]!.id }, ctx(f));
		const m = await executeCommand(ModifyReservation, modifyReservation, { reservationId: r.reservationId, roomTypeId: dlx }, ctx(f));
		expect(m.quotedTotalCents).toBe(22000);
		expect(await sold(std, ['2030-04-11'])).toEqual({ '2030-04-11': 0 });
		expect(await sold(dlx, ['2030-04-11'])).toEqual({ '2030-04-11': 1 });
		const after = await getRes(r.reservationId);
		expect(after.confirmationCode).toBe(before.confirmationCode);
		expect(after.roomUnitId).toBeNull();

		// cannot move into sold-out nights
		await create(f, 0, '2030-04-20', '2030-04-21');
		const other = await create(f, 0, '2030-04-18', '2030-04-20');
		expect(await code(executeCommand(ModifyReservation, modifyReservation, { reservationId: other.reservationId, checkOut: '2030-04-21' }, ctx(f)))).toBe('CONFLICT');
		expect(await sold(std, ['2030-04-18', '2030-04-19', '2030-04-20'])).toEqual({ '2030-04-18': 1, '2030-04-19': 1, '2030-04-20': 1 });
	});

	it('PR-07/10 extends an overstaying in-house guest; blocks type changes in-house', async () => {
		const f = await makeProperty(db, [['Std', 10000, 2], ['Dlx', 20000, 1]]);
		const r = await create(f, 0, TODAY, addDays(TODAY, 1));
		await executeCommand(CheckIn, checkIn, { reservationId: r.reservationId, roomUnitId: f.types[0]!.units[0]!.id, idDocumentType: 'ID', idDocumentNumber: '1' }, ctx(f));
		await executeCommand(RunNightAudit, runNightAudit, {}, ctx(f));

		const tomorrow = new Date(NOW.getTime() + 86_400_000);
		const ops = await executeQuery(GetDailyOps, getDailyOps, { date: addDays(TODAY, 2) }, ctx(f, tomorrow));
		expect(ops.overstays.map((o) => o.reservationId)).toEqual([r.reservationId]);
		const audit = await executeCommand(RunNightAudit, runNightAudit, { businessDate: addDays(TODAY, 1) }, ctx(f, tomorrow));
		expect(audit.overstays).toBe(1);

		await executeCommand(ModifyReservation, modifyReservation, { reservationId: r.reservationId, checkOut: addDays(TODAY, 2) }, ctx(f, tomorrow));
		expect((await getRes(r.reservationId)).checkOut).toBe(addDays(TODAY, 2));
		expect(await code(executeCommand(ModifyReservation, modifyReservation, { reservationId: r.reservationId, roomTypeId: f.types[1]!.id }, ctx(f, tomorrow)))).toBe('VALIDATION');
	});

	it('PR-08 moves an in-house guest to another type, moving remaining inventory', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1], ['Dlx', 20000, 1]]);
		const r = await create(f, 0, TODAY, addDays(TODAY, 3));
		const oldRoom = f.types[0]!.units[0]!.id;
		const newRoom = f.types[1]!.units[0]!.id;
		await executeCommand(CheckIn, checkIn, { reservationId: r.reservationId, roomUnitId: oldRoom, idDocumentType: 'ID', idDocumentNumber: '1' }, ctx(f));
		const moved = await executeCommand(MoveRoom, moveRoom, { reservationId: r.reservationId, roomUnitId: newRoom, reason: 'AC broken' }, ctx(f));
		expect(moved.roomNumber).toBe(f.types[1]!.units[0]!.roomNumber);
		const nights = [TODAY, addDays(TODAY, 1), addDays(TODAY, 2)];
		expect(Object.values(await sold(f.types[0]!.id, nights))).toEqual([0, 0, 0]);
		expect(Object.values(await sold(f.types[1]!.id, nights))).toEqual([1, 1, 1]);
		const res = await getRes(r.reservationId);
		expect(res.roomUnitId).toBe(newRoom);
		expect(res.notes).toContain('AC broken');
		const [old] = await db.select().from(roomUnit).where(eq(roomUnit.id, oldRoom));
		expect(old!.housekeepingStatus).toBe('DIRTY');
	});

	it('PR-09 night audit marks missed arrivals NO_SHOW and releases inventory; today’s arrivals are safe', async () => {
		const f = await makeProperty(db, [['Std', 10000, 2]]);
		const missed = await create(f, 0, TODAY, addDays(TODAY, 3));
		const lateToday = await create(f, 0, addDays(TODAY, 1), addDays(TODAY, 2));
		const tomorrow = new Date(NOW.getTime() + 86_400_000);
		const audit = await executeCommand(RunNightAudit, runNightAudit, {}, ctx(f, tomorrow)); // business date = TODAY+1
		expect(audit.noShows).toBe(1);
		expect((await getRes(missed.reservationId)).status).toBe('NO_SHOW');
		expect((await getRes(lateToday.reservationId)).status).toBe('CONFIRMED');
		expect(await sold(f.types[0]!.id, [addDays(TODAY, 1), addDays(TODAY, 2)])).toEqual({ [addDays(TODAY, 1)]: 1, [addDays(TODAY, 2)]: 0 });
		// manual path rejects future arrivals
		const future = await create(f, 0, addDays(TODAY, 5), addDays(TODAY, 6));
		expect(await code(executeCommand(MarkNoShow, markNoShowHandler, { reservationId: future.reservationId }, ctx(f)))).toBe('CONFLICT');
	});

	it('PR-11/18 early departure voids prepaid nights, refunds credit, and issues gap-free invoices', async () => {
		const f = await makeProperty(db, [['Std', 10000, 2]], { mode: 'UPFRONT' });
		const r = await create(f, 0, TODAY, addDays(TODAY, 3));
		const { folioId } = await executeCommand(CheckIn, checkIn, { reservationId: r.reservationId, roomUnitId: f.types[0]!.units[0]!.id, idDocumentType: 'ID', idDocumentNumber: '1' }, ctx(f));
		await executeCommand(RecordPayment, recordPayment, { folioId, method: 'CARD', amountCents: 33000, referenceNo: 'AUTH1' }, ctx(f));
		await executeCommand(UpdateFolioBilling, updateFolioBilling, { folioId, payerName: 'Ana Cruz', companyName: 'Acme Inc', taxId: 'TIN-123' }, ctx(f));

		// A failed checkout must not consume an invoice number.
		const other = await create(f, 0, TODAY, addDays(TODAY, 1));
		await executeCommand(CheckIn, checkIn, { reservationId: other.reservationId, roomUnitId: f.types[0]!.units[1]!.id, idDocumentType: 'ID', idDocumentNumber: '2' }, ctx(f));
		expect(await code(executeCommand(CheckOut, checkOut, { reservationId: other.reservationId }, ctx(f)))).toBe('CONFLICT');

		const out = await executeCommand(CheckOut, checkOut, { reservationId: r.reservationId, releaseUnusedNights: true, settleWith: { method: 'CARD' } }, ctx(f));
		expect(out.releasedNights).toEqual([addDays(TODAY, 1), addDays(TODAY, 2)]);
		expect(out.invoices.map((i) => i.invoiceNumber)).toEqual(['INV-000001']);
		const ledger = await executeQuery(GetFolioLedger, getFolioLedger, { reservationId: r.reservationId }, ctx(f));
		const fo = ledger.folios[0]!;
		expect(fo).toMatchObject({ balanceCents: 0, totalChargesCents: 11000, totalPaymentsCents: 11000, companyName: 'Acme Inc', invoiceNumber: 'INV-000001' });
		expect(fo.payments.find((p) => p.kind === 'REFUND')?.amountCents).toBe(-22000);
		expect(await sold(f.types[0]!.id, [addDays(TODAY, 1), addDays(TODAY, 2)])).toEqual({ [addDays(TODAY, 1)]: 0, [addDays(TODAY, 2)]: 0 });
		expect((await getRes(r.reservationId)).checkOut).toBe(addDays(TODAY, 1));

		const out2 = await executeCommand(CheckOut, checkOut, { reservationId: other.reservationId, settleWith: { method: 'CASH' } }, ctx(f));
		expect(out2.invoices.map((i) => i.invoiceNumber)).toEqual(['INV-000002']);
		// settled invoice details are frozen
		expect(await code(executeCommand(UpdateFolioBilling, updateFolioBilling, { folioId, payerName: 'X' }, ctx(f)))).toBe('CONFLICT');
	});

	it('PR-19 cashier report reconciles and CSV export works', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]], { mode: 'UPFRONT' });
		const r = await create(f, 0, TODAY, addDays(TODAY, 1));
		const { folioId } = await executeCommand(CheckIn, checkIn, { reservationId: r.reservationId, roomUnitId: f.types[0]!.units[0]!.id, idDocumentType: 'ID', idDocumentNumber: '1' }, ctx(f));
		await executeCommand(RecordPayment, recordPayment, { folioId, method: 'CASH', amountCents: 5000 }, ctx(f));
		await executeCommand(CheckOut, checkOut, { reservationId: r.reservationId, settleWith: { method: 'CARD', referenceNo: '=cmd()' } }, ctx(f));

		// Ledger rows are stamped by the DB clock (real time), so report on the actual posting date.
		const day = dateIn(new Date(), 'UTC');
		const report = await executeQuery(GetCashierReport, getCashierReport, { from: day, to: day }, ctx(f));
		expect(report.totalCents).toBe(11000);
		expect(report.byMethod.find((m) => m.method === 'CASH')?.cents).toBe(5000);
		expect(report.byMethod.find((m) => m.method === 'CARD')?.cents).toBe(6000);

		const csv = await executeQuery(ExportDataset, exportDataset, { dataset: 'payments', from: day, to: day }, ctx(f));
		expect(csv.rows).toHaveLength(2);
		expect(csv.columns).toContain('invoice_number');
		const items = await executeQuery(ExportDataset, exportDataset, { dataset: 'folio-items', from: day, to: day }, ctx(f));
		expect(items.rows).toHaveLength(1);
		const pos = { ...f.admin, role: 'POS' as const };
		expect(await code(executeQuery(ExportDataset, exportDataset, { dataset: 'payments', from: TODAY, to: TODAY }, { db, actor: pos }))).toBe('FORBIDDEN');
	});
});
