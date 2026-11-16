/** PR-23 — operational audit log, against a real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { DB } from './db/client';
import { auditEvent } from './db/schema';
import { executeCommand, executePublicCommand, executeQuery } from './cqrs/execute';
import { DomainError } from './cqrs/errors';
import { guest, makeProperty, NOW, openTestDb, TEST_DB_URL, TEST_PII_KEYRING, TODAY, type Fixture } from './testkit';
import { addDays } from '$lib/shared/domain/dates';
import { CreateReservation } from '$lib/features/reservations/create-reservation/contract';
import { createFrontDeskReservation } from '$lib/features/reservations/create-reservation/handler.server';
import { CancelReservation } from '$lib/features/reservations/cancel-reservation/contract';
import { cancelReservationHandler } from '$lib/features/reservations/cancel-reservation/handler.server';
import { CheckIn } from '$lib/features/front-desk/check-in/contract';
import { makeCheckIn } from '$lib/features/front-desk/check-in/handler.server';
import { PostCharge } from '$lib/features/folio/post-charge/contract';
import { postCharge } from '$lib/features/folio/post-charge/handler.server';
import { VoidItem } from '$lib/features/folio/void-item/contract';
import { voidItem } from '$lib/features/folio/void-item/handler.server';
import { RecordPayment } from '$lib/features/folio/record-payment/contract';
import { recordPayment } from '$lib/features/folio/record-payment/handler.server';
import { SetRoomStatus } from '$lib/features/housekeeping/set-room-status/contract';
import { setRoomStatus } from '$lib/features/housekeeping/set-room-status/handler.server';
import { CreateBooking } from '$lib/features/booking-engine/create-booking/contract';
import { createBooking } from '$lib/features/booking-engine/create-booking/handler.server';
import { GetAuditLog } from '$lib/features/audit/get-audit-log/contract';
import { getAuditLog } from '$lib/features/audit/get-audit-log/handler.server';

const checkIn = makeCheckIn(() => TEST_PII_KEYRING);

let db: DB;
let close: () => Promise<void>;
beforeAll(() => {
	if (TEST_DB_URL) ({ db, close } = openTestDb());
});
afterAll(async () => close?.());

const ctx = (f: Fixture) => ({ db, actor: f.admin, now: NOW });
const events = (f: Fixture) => db.select().from(auditEvent).where(eq(auditEvent.propertyId, f.propertyId)).orderBy(auditEvent.occurredAt);
async function code(p: Promise<unknown>) {
	const e = await p.then(() => null, (x: unknown) => x);
	expect(e).toBeInstanceOf(DomainError);
	return (e as DomainError).code;
}

describe.skipIf(!TEST_DB_URL)('audit log (integration)', () => {
	it('writes exactly one row per successful command, attributed and linked to the reservation', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const r = await executeCommand(CreateReservation, createFrontDeskReservation, { roomTypeId: f.types[0]!.id, checkIn: TODAY, checkOut: addDays(TODAY, 1), adults: 1, guest }, ctx(f));
		const { folioId } = await executeCommand(CheckIn, checkIn, { reservationId: r.reservationId, roomUnitId: f.types[0]!.units[0]!.id, idDocumentType: 'Passport', idDocumentNumber: 'P7654321' }, ctx(f));
		const charge = await executeCommand(PostCharge, postCharge, { folioId, line: { kind: 'custom', category: 'FEE', description: 'Late checkout', unitPriceCents: 1000, taxable: false } }, ctx(f));
		await executeCommand(RecordPayment, recordPayment, { folioId, method: 'CARD', amountCents: 500, referenceNo: 'AUTH-123456' }, ctx(f));
		await executeCommand(VoidItem, voidItem, { itemId: charge.itemId, reason: 'Waived' }, ctx(f));
		await executeCommand(SetRoomStatus, setRoomStatus, { roomUnitId: f.types[0]!.units[0]!.id, status: 'INSPECTED' }, ctx(f));

		const rows = await events(f);
		expect(rows.map((e) => e.command)).toEqual(['reservations.create', 'frontDesk.checkIn', 'folio.postCharge', 'folio.recordPayment', 'folio.voidItem', 'housekeeping.setRoomStatus']);
		expect(rows.every((e) => e.actorUserId === f.admin.userId && e.actorLabel === 'Tess Admin')).toBe(true);
		// folio / line / payment commands resolve back to the reservation
		expect(rows.slice(0, 5).every((e) => e.reservationId === r.reservationId)).toBe(true);
		expect(rows[5]).toMatchObject({ entityType: 'roomUnit', reservationId: null });

		// PII redacted, payment reference masked
		const json = JSON.stringify(rows.map((e) => e.input));
		expect(json).not.toContain('Cruz');
		expect(json).not.toContain('P7654321');
		expect(json).not.toContain('AUTH-123456');
		expect(json).toContain('…3456');
		expect(rows[4]!.input).toMatchObject({ reason: 'Waived' });
	});

	it('writes nothing when the command rolls back', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const r = await executeCommand(CreateReservation, createFrontDeskReservation, { roomTypeId: f.types[0]!.id, checkIn: '2030-06-01', checkOut: '2030-06-02', adults: 1, guest }, ctx(f));
		await executeCommand(CancelReservation, cancelReservationHandler, { reservationId: r.reservationId }, ctx(f));
		// second cancel fails inside the transaction → no audit row
		expect(await code(executeCommand(CancelReservation, cancelReservationHandler, { reservationId: r.reservationId }, ctx(f)))).toBe('CONFLICT');
		// validation failure never reaches the transaction
		expect(await code(executeCommand(CancelReservation, cancelReservationHandler, { reservationId: 'nope' }, ctx(f)))).toBe('VALIDATION');
		expect((await events(f)).map((e) => e.command)).toEqual(['reservations.create', 'reservations.cancel']);
	});

	it('audits public bookings with the property resolved and no staff actor', async () => {
		const f = await makeProperty(db, [['Std', 10000, 2]]);
		await executePublicCommand(CreateBooking, createBooking, { property: f.slug, checkIn: '2030-07-01', checkOut: '2030-07-02', rooms: [{ roomTypeId: f.types[0]!.id, adults: 1 }], guest, expectedTotalCents: 11000 }, { db, now: NOW });
		const [e] = await events(f);
		expect(e).toMatchObject({ command: 'bookingEngine.book', actorUserId: null, actorLabel: 'Public booking engine' });
		expect(JSON.stringify(e!.input)).not.toContain('ana@example.com');
	});

	it('is append-only and access-controlled', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		const r = await executeCommand(CreateReservation, createFrontDeskReservation, { roomTypeId: f.types[0]!.id, checkIn: '2030-08-01', checkOut: '2030-08-02', adults: 1, guest }, ctx(f));
		const [e] = await events(f);
		await expect(db.delete(auditEvent).where(eq(auditEvent.id, e!.id))).rejects.toBeTruthy();
		await expect(db.update(auditEvent).set({ actorLabel: 'someone else' }).where(eq(auditEvent.id, e!.id))).rejects.toBeTruthy();

		const frontDesk = { ...f.admin, role: 'FRONT_DESK' as const };
		expect(await code(executeQuery(GetAuditLog, getAuditLog, {}, { db, actor: frontDesk }))).toBe('FORBIDDEN');
		const history = await executeQuery(GetAuditLog, getAuditLog, { reservationId: r.reservationId }, { db, actor: frontDesk });
		expect(history.events.map((x) => x.command)).toEqual(['reservations.create']);
		const pos = { ...f.admin, role: 'POS' as const };
		expect(await code(executeQuery(GetAuditLog, getAuditLog, { reservationId: r.reservationId }, { db, actor: pos }))).toBe('FORBIDDEN');

		// another property's manager sees nothing of this one
		const other = await makeProperty(db, [['Std', 10000, 1]]);
		const foreign = await executeQuery(GetAuditLog, getAuditLog, { reservationId: r.reservationId }, { db, actor: other.admin });
		expect(foreign.events).toHaveLength(0);
	});
});
