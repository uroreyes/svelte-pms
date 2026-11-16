/**
 * Demo bookings for ONE existing property (staging / training data). Every booking goes through the real
 * slice handlers via executeCommand, so it obeys every invariant and is audited like a staff action.
 * Pairs with the operational reset: reset → seed demo → test → reset → go live.
 */
import { and, asc, count, eq, ne } from 'drizzle-orm';
import type { DB } from '$lib/server/db/client';
import { catalogItem, property, reservation, roomType, roomUnit, staffUser } from '$lib/server/db/schema';
import type { Actor } from '$lib/server/cqrs/actor';
import { DomainError } from '$lib/server/cqrs/errors';
import { executeCommand } from '$lib/server/cqrs/execute';
import type { PiiKeyring } from '$lib/server/security/crypto';
import { addDays, todayIn } from '$lib/shared/domain/dates';
import { CreateReservation } from '$lib/features/reservations/create-reservation/contract';
import { createFrontDeskReservation } from '$lib/features/reservations/create-reservation/handler.server';
import { CheckIn } from '$lib/features/front-desk/check-in/contract';
import { makeCheckIn } from '$lib/features/front-desk/check-in/handler.server';
import { PostCharge } from '$lib/features/folio/post-charge/contract';
import { postCharge } from '$lib/features/folio/post-charge/handler.server';
import type { DemoSeedArgs } from './seed-demo-args';
import { errorSummary } from './error-summary';

export { errorSummary } from './error-summary';

export type DemoRefusalCode = 'PROPERTY_NOT_FOUND' | 'OPERATOR_INVALID' | 'HAS_RESERVATIONS' | 'NO_ROOMS';

export class DemoSeedRefused extends Error {
	constructor(
		readonly code: DemoRefusalCode,
		message: string
	) {
		super(message);
		this.name = 'DemoSeedRefused';
	}
}

export interface DemoSeedResult {
	reservations: number;
	checkedIn: number;
	charges: number;
	/** `<room>: <reason>` for bookings or check-ins the handlers refused. */
	skipped: string[];
}

const GUESTS = [
	['Maya', 'Santos'], ['Noah', 'Reyes'], ['Lena', 'Okafor'], ['Kenji', 'Mori'], ['Ruth', 'Adeyemi'],
	['Omar', 'Haddad'], ['Ines', 'Duarte'], ['Theo', 'Lindqvist'], ['Priya', 'Nair'], ['Sam', 'Walker']
] as const;

/** 4 in-house today, 1 arriving today (not checked in), 5 future arrivals; repeats a week later per extra cycle. */
const PATTERN: readonly { inOffset: number; nights: number; checkIn: boolean }[] = [
	{ inOffset: 0, nights: 3, checkIn: true },
	{ inOffset: 0, nights: 2, checkIn: true },
	{ inOffset: 0, nights: 4, checkIn: true },
	{ inOffset: 0, nights: 5, checkIn: true },
	{ inOffset: 0, nights: 2, checkIn: false },
	{ inOffset: 1, nights: 3, checkIn: false },
	{ inOffset: 2, nights: 2, checkIn: false },
	{ inOffset: 3, nights: 4, checkIn: false },
	{ inOffset: 5, nights: 2, checkIn: false },
	{ inOffset: 6, nights: 5, checkIn: false }
];

export interface DemoSlot {
	inOffset: number;
	nights: number;
	checkIn: boolean;
	guest: readonly [string, string];
}

/** Pure: the i-th demo booking. Later cycles start 7 days further out and never check in. */
export function demoSlot(i: number): DemoSlot {
	const cycle = Math.floor(i / PATTERN.length);
	const p = PATTERN[i % PATTERN.length]!;
	return { inOffset: p.inOffset + cycle * 7, nights: p.nights, checkIn: cycle === 0 && p.checkIn, guest: GUESTS[i % GUESTS.length]! };
}

/** Pure: round-robin across room types so every type gets bookings; each unit is used at most once (no overlaps). */
export function interleaveByType<T extends { roomTypeId: string }>(units: readonly T[]): T[] {
	const groups = new Map<string, T[]>();
	for (const u of units) groups.set(u.roomTypeId, [...(groups.get(u.roomTypeId) ?? []), u]);
	const lists = [...groups.values()];
	const longest = Math.max(0, ...lists.map((l) => l.length));
	return Array.from({ length: longest }, (_, i) => lists.flatMap((l) => (l[i] ? [l[i]!] : [])))
		.flat();
}

/** Same rule as the operational reset: active, non-system ADMIN without a pending password change. */
async function resolveOperator(db: DB, propertyId: string, slug: string, email: string | null): Promise<Actor> {
	const [op] = await db
		.select({ id: staffUser.id, name: staffUser.name, email: staffUser.email })
		.from(staffUser)
		.where(
			and(
				eq(staffUser.propertyId, propertyId),
				eq(staffUser.role, 'ADMIN'),
				eq(staffUser.active, true),
				eq(staffUser.isSystem, false),
				eq(staffUser.mustChangePassword, false),
				...(email ? [eq(staffUser.email, email)] : [])
			)
		)
		.orderBy(asc(staffUser.createdAt))
		.limit(1);
	if (!op) {
		throw new DemoSeedRefused(
			'OPERATOR_INVALID',
			email ? `Operator ${email} is not an active ADMIN of "${slug}"` : `Property "${slug}" has no active ADMIN to attribute the bookings to`
		);
	}
	return { userId: op.id, propertyId, role: 'ADMIN', name: op.name, email: op.email, mustChangePassword: false };
}

export async function seedDemoBookings(
	db: DB,
	opts: { propertySlug: string; operatorEmail: string | null; count: number; ring: PiiKeyring; now: Date }
): Promise<DemoSeedResult & { operator: Actor; propertyName: string }> {
	const [p] = await db.select().from(property).where(eq(property.slug, opts.propertySlug));
	if (!p) throw new DemoSeedRefused('PROPERTY_NOT_FOUND', `Property "${opts.propertySlug}" not found`);
	const actor = await resolveOperator(db, p.id, p.slug, opts.operatorEmail);

	const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(reservation).where(eq(reservation.propertyId, p.id));
	if (n > 0) {
		throw new DemoSeedRefused('HAS_RESERVATIONS', `Property "${p.slug}" already has ${n} reservation(s) — run the operational reset first`);
	}

	const units = interleaveByType(
		await db
			.select({ id: roomUnit.id, roomNumber: roomUnit.roomNumber, roomTypeId: roomUnit.roomTypeId, status: roomUnit.housekeepingStatus, maxOccupancy: roomType.maxOccupancy })
			.from(roomUnit)
			.innerJoin(roomType, eq(roomType.id, roomUnit.roomTypeId))
			.where(and(eq(roomUnit.propertyId, p.id), ne(roomUnit.housekeepingStatus, 'OUT_OF_ORDER')))
			.orderBy(asc(roomType.createdAt), asc(roomUnit.roomNumber))
	);
	if (units.length === 0) throw new DemoSeedRefused('NO_ROOMS', `Property "${p.slug}" has no rooms in service`);

	const catalog = await db
		.select({ id: catalogItem.id })
		.from(catalogItem)
		.where(and(eq(catalogItem.propertyId, p.id), eq(catalogItem.active, true)))
		.orderBy(asc(catalogItem.name));

	const checkIn = makeCheckIn(() => opts.ring);
	const ctx = { db, actor, now: opts.now };
	const today = todayIn(p.timezone, opts.now);
	const result: DemoSeedResult = { reservations: 0, checkedIn: 0, charges: 0, skipped: [] };

	for (const [i, unit] of units.slice(0, opts.count).entries()) {
		const slot = demoSlot(i);
		const [firstName, lastName] = slot.guest;
		try {
			const created = await executeCommand(
				CreateReservation,
				createFrontDeskReservation,
				{
					roomTypeId: unit.roomTypeId,
					roomUnitId: unit.id,
					checkIn: addDays(today, slot.inOffset),
					checkOut: addDays(today, slot.inOffset + slot.nights),
					adults: Math.min(2, unit.maxOccupancy),
					guest: { firstName, lastName, email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com` },
					notes: 'Demo booking'
				},
				ctx
			);
			result.reservations++;
			if (!slot.checkIn) continue;
			const { folioId } = await executeCommand(
				CheckIn,
				checkIn,
				{ reservationId: created.reservationId, idDocumentType: 'Passport', idDocumentNumber: `DEMO${String(i + 1).padStart(5, '0')}` },
				ctx
			);
			result.checkedIn++;
			for (const item of catalog.slice(i % 3, (i % 3) + 2)) {
				await executeCommand(PostCharge, postCharge, { folioId, quantity: 1 + (i % 2), line: { kind: 'catalog', catalogItemId: item.id } }, ctx);
				result.charges++;
			}
		} catch (e) {
			if (!(e instanceof DomainError)) throw e;
			result.skipped.push(`${unit.roomNumber}: ${e.message}`);
		}
	}
	return { ...result, operator: actor, propertyName: p.name };
}

/** CLI body. Exit codes: 0 at least one booking created · 1 refused, nothing created, or fatal. */
export async function runDemoSeed(
	db: DB,
	args: DemoSeedArgs,
	deps: { ring: PiiKeyring; now: Date; log: (line: string) => void; error: (line: string) => void }
): Promise<number> {
	try {
		const r = await seedDemoBookings(db, { ...args, ring: deps.ring, now: deps.now });
		deps.log(`Property: ${r.propertyName} (${args.propertySlug}) · operator: ${r.operator.name} <${r.operator.email}>`);
		deps.log(`Demo data: ${r.reservations} reservation(s), ${r.checkedIn} checked in, ${r.charges} folio charge(s).`);
		for (const s of r.skipped) deps.error(`  skipped ${s}`);
		if (r.reservations === 0) {
			deps.error('No demo bookings were created.');
			return 1;
		}
		return 0;
	} catch (e) {
		deps.error(e instanceof DemoSeedRefused ? e.message : `Demo seed failed: ${errorSummary(e)}`);
		return 1;
	}
}
