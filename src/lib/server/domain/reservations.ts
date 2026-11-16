/**
 * Reservation factory shared by front-desk, booking-engine and channel-ingest slices.
 * Runs inside the caller's transaction.
 */
import { randomInt } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { evaluateStay } from '$lib/shared/domain/availability';
import { evaluatePlan, priceNights } from '$lib/shared/domain/pricing';
import { nightsOf, type IsoDate } from '$lib/shared/domain/dates';
import type { ReservationSource } from '$lib/shared/domain/enums';
import { quoteStay } from '$lib/shared/domain/money';
import type { Executor, Tx } from '../db/client';
import { guest, reservation, reservationNight, roomInventoryDaily, roomType, roomUnit } from '../db/schema';
import { conflict, invalid, notFound } from '../cqrs/errors';
import { consumeInventory, lockInventory, releaseInventory, toDayInventory, type InventoryRow } from './inventory';
import { enqueueAri } from './outbox';
import { loadPlanDays, NO_DAYS, resolvePlan } from './rate-plans';
import { loadTaxRules } from './taxes';
import { loadProperty } from './property';

export const MAX_STAY_NIGHTS = 60;

export interface GuestInput {
	firstName: string;
	lastName: string;
	email?: string | undefined;
	phone?: string | undefined;
}

export interface NewReservation {
	propertyId: string;
	roomTypeId: string;
	checkIn: IsoDate;
	checkOut: IsoDate;
	adults: number;
	children: number;
	guest: GuestInput;
	source: ReservationSource;
	externalRef?: string | undefined;
	notes?: string | undefined;
	roomUnitId?: string | undefined;
	/** 'reject' for direct/front-desk; 'flag' for OTA ingest where the sale already happened. */
	overbookPolicy: 'reject' | 'flag';
	/** Server re-quotes; a mismatch means the client saw a stale price. */
	expectedTotalCents?: number | undefined;
	/** Rate plan; defaults to the room type's default plan. */
	ratePlanId?: string | null | undefined;
	/** Multi-room bookings: reuse one guest and attach to the booking. */
	guestId?: string | undefined;
	bookingId?: string | undefined;
}

export interface CreatedReservation {
	reservationId: string;
	confirmationCode: string;
	totalCents: number;
	overbooked: boolean;
	guestId: string;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomConfirmationCode(length = 8): string {
	return Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

export async function uniqueConfirmationCode(db: Executor): Promise<string> {
	for (let attempt = 0; attempt < 5; attempt++) {
		const code = randomConfirmationCode();
		const [hit] = await db.select({ id: reservation.id }).from(reservation).where(eq(reservation.confirmationCode, code)).limit(1);
		if (!hit) return code;
	}
	throw new Error('Could not allocate a unique confirmation code');
}

export function validateStay(checkIn: IsoDate, checkOut: IsoDate): IsoDate[] {
	const nights = nightsOf(checkIn, checkOut);
	if (nights.length === 0) throw invalid('Check-out must be after check-in');
	if (nights.length > MAX_STAY_NIGHTS) throw invalid(`Stays are limited to ${MAX_STAY_NIGHTS} nights`);
	return nights;
}

export async function createReservation(tx: Tx, input: NewReservation): Promise<CreatedReservation> {
	const nights = validateStay(input.checkIn, input.checkOut);
	const prop = await loadProperty(tx, input.propertyId);
	const [type] = await tx
		.select()
		.from(roomType)
		.where(and(eq(roomType.id, input.roomTypeId), eq(roomType.propertyId, input.propertyId)))
		.limit(1);
	if (!type) throw notFound('Room type');
	if (input.adults + input.children > type.maxOccupancy) {
		throw invalid(`${type.name} sleeps at most ${type.maxOccupancy} guests`);
	}
	if (input.roomUnitId) {
		const [unit] = await tx
			.select({ roomTypeId: roomUnit.roomTypeId })
			.from(roomUnit)
			.where(and(eq(roomUnit.id, input.roomUnitId), eq(roomUnit.propertyId, input.propertyId)))
			.limit(1);
		if (!unit) throw notFound('Room');
		if (unit.roomTypeId !== type.id) throw invalid('Room does not belong to the selected room type');
	}

	const plan = await resolvePlan(tx, prop.id, type.id, input.ratePlanId);
	const planDays = (await loadPlanDays(tx, [plan.id], input.checkIn, input.checkOut)).get(plan.id ?? '') ?? NO_DAYS;
	const rows = await lockInventory(tx, type.id, nights);
	const days = rows.map((r) => toDayInventory(r, type.baseRateCents));
	const verdict = evaluateStay(days, nights);
	if (!verdict.bookable && input.overbookPolicy === 'reject') {
		throw conflict(verdict.message, { reason: verdict.reason, date: verdict.date });
	}
	const planVerdict = evaluatePlan(plan, planDays, nights);
	if (!planVerdict.ok && input.overbookPolicy === 'reject') throw conflict(planVerdict.message, { reason: planVerdict.reason });
	const overbooked = !verdict.bookable;

	const party = { adults: input.adults, children: input.children };
	const quote = quoteStay(priceNights(days, plan, planDays, party), await loadTaxRules(tx, prop), input.adults + input.children);
	if (input.expectedTotalCents !== undefined && input.expectedTotalCents !== quote.totalCents) {
		throw conflict('The price for this stay has changed — please review the new total', { totalCents: quote.totalCents });
	}

	await consumeInventory(tx, rows);

	const [g] = input.guestId
		? [{ id: input.guestId }]
		: await tx
				.insert(guest)
				.values({
					propertyId: prop.id,
					firstName: input.guest.firstName,
					lastName: input.guest.lastName,
					email: input.guest.email ?? null,
					phone: input.guest.phone ?? null
				})
				.returning({ id: guest.id });

	const confirmationCode = await uniqueConfirmationCode(tx);
	const [res] = await tx
		.insert(reservation)
		.values({
			propertyId: prop.id,
			guestId: g!.id,
			roomTypeId: type.id,
			roomUnitId: input.roomUnitId ?? null,
			ratePlanId: plan.id,
			bookingId: input.bookingId ?? null,
			confirmationCode,
			source: input.source,
			externalRef: input.externalRef ?? null,
			checkIn: input.checkIn,
			checkOut: input.checkOut,
			adults: input.adults,
			children: input.children,
			quotedTotalCents: quote.totalCents,
			overbooked,
			notes: input.notes ?? null
		})
		.returning({ id: reservation.id });

	await tx.insert(reservationNight).values(quote.nights.map((n) => ({ reservationId: res!.id, date: n.date, rateCents: n.rateCents })));
	await enqueueAri(tx, prop.id, type.id, input.checkIn, input.checkOut);

	return { reservationId: res!.id, confirmationCode, totalCents: quote.totalCents, overbooked, guestId: g!.id };
}

export type ReservationRow = typeof reservation.$inferSelect;

/** Lock a reservation row (scoped to the property). */
export async function lockReservation(tx: Tx, propertyId: string, reservationId: string): Promise<ReservationRow> {
	const [row] = await tx
		.select()
		.from(reservation)
		.where(and(eq(reservation.id, reservationId), eq(reservation.propertyId, propertyId)))
		.for('update');
	if (!row) throw notFound('Reservation');
	return row;
}

/** CONFIRMED → CANCELLED; releases inventory and pushes ARI. */
export async function cancelReservation(tx: Tx, res: ReservationRow, now: Date): Promise<void> {
	if (res.status !== 'CONFIRMED') throw conflict(`Only confirmed reservations can be cancelled (current: ${res.status})`);
	await releaseInventory(tx, res.roomTypeId, nightsOf(res.checkIn, res.checkOut));
	await tx.update(reservation).set({ status: 'CANCELLED', cancelledAt: now, roomUnitId: null }).where(eq(reservation.id, res.id));
	await enqueueAri(tx, res.propertyId, res.roomTypeId, res.checkIn, res.checkOut);
}

/** CONFIRMED → NO_SHOW; releases every night and pushes ARI. */
export async function markNoShow(tx: Tx, res: ReservationRow, now: Date): Promise<void> {
	if (res.status !== 'CONFIRMED') throw conflict(`Only confirmed reservations can be marked no-show (current: ${res.status})`);
	await releaseInventory(tx, res.roomTypeId, nightsOf(res.checkIn, res.checkOut));
	await tx.update(reservation).set({ status: 'NO_SHOW', noShowAt: now }).where(eq(reservation.id, res.id));
	await enqueueAri(tx, res.propertyId, res.roomTypeId, res.checkIn, res.checkOut);
}

export interface StayInventory {
	roomTypeId: string;
	nights: IsoDate[];
}

/**
 * Moves a reservation's inventory consumption from one (room type, nights) set to another.
 * Nights kept on the same room type are untouched; removed nights are released; added nights
 * must be open and have a free unit. Room types are locked in id order → no deadlocks.
 * Returns the current sell rate for every night of the target stay.
 */
export async function moveInventory(
	tx: Tx,
	propertyId: string,
	from: StayInventory,
	to: StayInventory,
	opts: { enforceMinLos: boolean }
): Promise<Map<IsoDate, number>> {
	const sameType = from.roomTypeId === to.roomTypeId;
	const kept = new Set(sameType ? from.nights.filter((n) => to.nights.includes(n)) : []);
	const removed = from.nights.filter((n) => !kept.has(n));
	const added = to.nights.filter((n) => !kept.has(n));

	const [target] = await tx
		.select()
		.from(roomType)
		.where(and(eq(roomType.id, to.roomTypeId), eq(roomType.propertyId, propertyId)));
	if (!target) throw notFound('Room type');

	const locked = new Map<string, InventoryRow[]>();
	for (const typeId of [...new Set([from.roomTypeId, to.roomTypeId])].sort()) {
		const dates = [...new Set([...(typeId === from.roomTypeId ? from.nights : []), ...(typeId === to.roomTypeId ? to.nights : [])])].sort();
		locked.set(typeId, await lockInventory(tx, typeId, dates));
	}

	const release = (locked.get(from.roomTypeId) ?? []).filter((r) => removed.includes(r.date));
	if (release.length > 0) {
		await tx
			.update(roomInventoryDaily)
			.set({ soldCount: sql`GREATEST(${roomInventoryDaily.soldCount} - 1, 0)`, updatedAt: new Date() })
			.where(inArray(roomInventoryDaily.id, release.map((r) => r.id)));
	}

	const targetRows = locked.get(to.roomTypeId) ?? [];
	const byDate = new Map(targetRows.map((r) => [r.date, r]));
	if (opts.enforceMinLos) {
		const arrival = byDate.get(to.nights[0]!);
		if (arrival?.minLos && to.nights.length < arrival.minLos) {
			throw conflict(`Minimum stay of ${arrival.minLos} nights for arrival on ${arrival.date}`, { reason: 'MIN_LOS' });
		}
	}
	const consume: InventoryRow[] = [];
	for (const date of added) {
		const row = byDate.get(date)!;
		// Same-type releases are disjoint from added nights, so the locked counts are current.
		if (row.isClosed) throw conflict(`Closed for sale on ${date}`, { reason: 'CLOSED', date });
		if (row.availableCount - row.soldCount <= 0) throw conflict(`${target.name} is sold out on ${date}`, { reason: 'SOLD_OUT', date });
		consume.push(row);
	}
	await consumeInventory(tx, consume);
	return new Map(targetRows.map((r) => [r.date, r.rateOverrideCents ?? target.baseRateCents]));
}
