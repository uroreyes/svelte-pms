/** Demo bookings seeder against the real test Postgres (per-test tenants, real executors, no mocks). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { DB } from './db/client';
import { auditEvent, catalogItem, reservation, roomUnit, staffUser } from './db/schema';
import { addStaff, makeProperty, NOW, openTestDb, TEST_DB_URL, TEST_PII_KEYRING, TODAY, type Fixture } from './testkit';
import { DemoSeedRefused, demoSlot, interleaveByType, runDemoSeed, seedDemoBookings } from './maintenance/seed-demo';

describe('demo seed — pure helpers', () => {
	it('interleaves units round-robin across room types', () => {
		const units = [
			{ roomTypeId: 'a', n: 1 }, { roomTypeId: 'a', n: 2 }, { roomTypeId: 'a', n: 3 },
			{ roomTypeId: 'b', n: 4 }, { roomTypeId: 'c', n: 5 }, { roomTypeId: 'c', n: 6 }
		];
		expect(interleaveByType(units).map((u) => u.n)).toEqual([1, 4, 5, 2, 6, 3]);
		expect(interleaveByType([])).toEqual([]);
	});

	it('first cycle: 4 in-house, later cycles a week out and never checked in', () => {
		expect([0, 1, 2, 3, 4].map((i) => demoSlot(i).checkIn)).toEqual([true, true, true, true, false]);
		expect(demoSlot(9)).toMatchObject({ inOffset: 6, nights: 5, checkIn: false });
		expect(demoSlot(10)).toMatchObject({ inOffset: 7, nights: 3, checkIn: false, guest: ['Maya', 'Santos'] });
	});
});

describe.skipIf(!TEST_DB_URL)('demo seed — database', () => {
	let db: DB;
	let close: () => Promise<void>;
	beforeAll(() => {
		({ db, close } = openTestDb());
	});
	afterAll(async () => close?.());

	const seed = (f: Fixture, over: { operatorEmail?: string | null; count?: number } = {}) =>
		seedDemoBookings(db, { propertySlug: f.slug, operatorEmail: over.operatorEmail ?? null, count: over.count ?? 10, ring: TEST_PII_KEYRING, now: NOW });

	const withCatalog = async (f: Fixture) => {
		await db.insert(catalogItem).values(
			['A water', 'B beer', 'C laundry'].map((name, i) => ({ propertyId: f.propertyId, category: 'F&B', name, unitPriceCents: 100 * (i + 1) }))
		);
		return f;
	};
	const reservationsOf = (f: Fixture) => db.select().from(reservation).where(eq(reservation.propertyId, f.propertyId));
	const refusal = async (p: Promise<unknown>) => {
		try {
			await p;
		} catch (e) {
			if (e instanceof DemoSeedRefused) return e.code;
			throw e;
		}
		throw new Error('expected DemoSeedRefused');
	};

	it('books one stay per room (capped by rooms), checks in today\'s first four and posts charges', async () => {
		const f = await withCatalog(await makeProperty(db, [['Std', 10000, 3], ['Dlx', 15000, 2]]));
		const r = await seed(f);
		expect(r).toMatchObject({ reservations: 5, checkedIn: 4, charges: 7, skipped: [] });
		expect(r.operator.userId).toBe(f.admin.userId);

		const rows = await reservationsOf(f);
		expect(rows).toHaveLength(5);
		expect(rows.filter((x) => x.status === 'CHECKED_IN')).toHaveLength(4);
		expect(new Set(rows.map((x) => x.roomUnitId)).size).toBe(5);
		expect(rows.filter((x) => x.checkIn === TODAY)).toHaveLength(5);

		const actors = await db.selectDistinct({ id: auditEvent.actorUserId }).from(auditEvent).where(eq(auditEvent.propertyId, f.propertyId));
		expect(actors).toEqual([{ id: f.admin.userId }]);
	});

	it('honours --count and is refused once the property has reservations', async () => {
		const f = await makeProperty(db, [['Std', 10000, 4]]);
		expect(await seed(f, { count: 2 })).toMatchObject({ reservations: 2, checkedIn: 2, charges: 0 });
		expect(await refusal(seed(f))).toBe('HAS_RESERVATIONS');
		expect(await reservationsOf(f)).toHaveLength(2);
	});

	it('skips out-of-order rooms and reports a check-in the handler refuses', async () => {
		const f = await makeProperty(db, [['Std', 10000, 3]]);
		const [u101, u102, u103] = f.types[0]!.units;
		await db.update(roomUnit).set({ housekeepingStatus: 'OUT_OF_ORDER' }).where(eq(roomUnit.id, u101!.id));
		await db.update(roomUnit).set({ housekeepingStatus: 'DIRTY' }).where(eq(roomUnit.id, u102!.id));

		const r = await seed(f);
		expect(r).toMatchObject({ reservations: 2, checkedIn: 1 });
		expect(r.skipped).toEqual([`${u102!.roomNumber}: Room ${u102!.roomNumber} is dirty — it must be clean or inspected`]);
		const rows = await reservationsOf(f);
		expect(rows.map((x) => x.roomUnitId).sort()).toEqual([u102!.id, u103!.id].sort());
	});

	it('refuses unknown property, non-admin operator and admins with a pending password change', async () => {
		const f = await makeProperty(db, [['Std', 10000, 1]]);
		expect(await refusal(seedDemoBookings(db, { propertySlug: 'no-such-slug', operatorEmail: null, count: 1, ring: TEST_PII_KEYRING, now: NOW }))).toBe('PROPERTY_NOT_FOUND');

		const desk = await addStaff(db, f, { role: 'FRONT_DESK' });
		expect(await refusal(seed(f, { operatorEmail: desk.email }))).toBe('OPERATOR_INVALID');

		await db.update(staffUser).set({ mustChangePassword: true }).where(eq(staffUser.id, f.admin.userId));
		expect(await refusal(seed(f))).toBe('OPERATOR_INVALID');

		const second = await addStaff(db, f, { role: 'ADMIN' });
		const r = await seed(f);
		expect(r.operator.userId).toBe(second.userId);
		expect(r.reservations).toBe(1);
	});

	it('runDemoSeed: exit 0 with a summary, exit 1 with the refusal message', async () => {
		const f = await withCatalog(await makeProperty(db, [['Std', 10000, 1]]));
		const out: string[] = [];
		const err: string[] = [];
		const io = { ring: TEST_PII_KEYRING, now: NOW, log: (l: string) => out.push(l), error: (l: string) => err.push(l) };

		expect(await runDemoSeed(db, { propertySlug: f.slug, operatorEmail: null, count: 10 }, io)).toBe(0);
		expect(out[1]).toBe('Demo data: 1 reservation(s), 1 checked in, 2 folio charge(s).');

		expect(await runDemoSeed(db, { propertySlug: f.slug, operatorEmail: null, count: 10 }, io)).toBe(1);
		expect(err.at(-1)).toBe(`Property "${f.slug}" already has 1 reservation(s) — run the operational reset first`);
	});
});
