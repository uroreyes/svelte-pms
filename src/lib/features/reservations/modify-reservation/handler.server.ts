import { and, eq, inArray } from 'drizzle-orm';
import { nightsOf } from '$lib/shared/domain/dates';
import { quoteStay } from '$lib/shared/domain/money';
import { evaluatePlan, planNightPrice } from '$lib/shared/domain/pricing';
import { loadPlanDays, NO_DAYS, resolvePlan } from '$lib/server/domain/rate-plans';
import { loadTaxRules } from '$lib/server/domain/taxes';
import { reservation, reservationNight, roomType } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { conflict, invalid, notFound } from '$lib/server/cqrs/errors';
import { postedRoomDates } from '$lib/server/domain/folio';
import { enqueueAri } from '$lib/server/domain/outbox';
import { businessDate, loadProperty } from '$lib/server/domain/property';
import { lockReservation, moveInventory, validateStay } from '$lib/server/domain/reservations';
import { lockAssignableUnit } from '$lib/server/domain/rooms';
import type { ModifyReservation } from './contract';

/**
 * Change dates / room type / party while keeping the confirmation code.
 * Kept nights keep their booked rate unless `repriceExisting`; a room-type change re-prices everything.
 * In-house guests may only change their departure date and party (room changes → move-room).
 */
export const modifyReservation: CommandHandler<typeof ModifyReservation> = async (input, { db, actor, now }) => {
	const p = await loadProperty(db, actor.propertyId);
	const today = businessDate(p, now);
	const res = await lockReservation(db, actor.propertyId, input.reservationId);
	if (res.status !== 'CONFIRMED' && res.status !== 'CHECKED_IN') throw conflict(`A ${res.status} reservation cannot be modified`);

	const next = {
		checkIn: input.checkIn ?? res.checkIn,
		checkOut: input.checkOut ?? res.checkOut,
		roomTypeId: input.roomTypeId ?? res.roomTypeId,
		adults: input.adults ?? res.adults,
		children: input.children ?? res.children
	};
	const typeChanged = next.roomTypeId !== res.roomTypeId;
	const plan = await resolvePlan(db, actor.propertyId, next.roomTypeId, input.ratePlanId ?? (typeChanged ? null : res.ratePlanId));
	const planChanged = (plan.id ?? null) !== (res.ratePlanId ?? null);
	const partyChanged = next.adults !== res.adults || next.children !== res.children;
	const arrivalChanged = next.checkIn !== res.checkIn;

	if (res.status === 'CHECKED_IN') {
		if (arrivalChanged || typeChanged || planChanged) throw invalid('For in-house guests only the departure date and party can change — use Room move to change rooms');
		if (next.checkOut <= today) throw conflict('Departure must be after today — use early departure at check-out instead');
	} else if (arrivalChanged && next.checkIn < today) {
		throw invalid('Arrival cannot be moved into the past');
	}
	const newNights = validateStay(next.checkIn, next.checkOut);
	const oldNights = nightsOf(res.checkIn, res.checkOut);

	const [type] = await db
		.select()
		.from(roomType)
		.where(and(eq(roomType.id, next.roomTypeId), eq(roomType.propertyId, actor.propertyId)));
	if (!type) throw notFound('Room type');
	if (next.adults + next.children > type.maxOccupancy) throw invalid(`${type.name} sleeps at most ${type.maxOccupancy} guests`);

	const removed = oldNights.filter((d) => !newNights.includes(d));
	if (res.status === 'CHECKED_IN' && removed.length > 0) {
		const posted = await postedRoomDates(db, res.id);
		const charged = removed.filter((d) => posted.has(d));
		if (charged.length > 0) throw conflict(`Room charges are already posted for ${charged.join(', ')} — void them first`);
	}

	const roomUnitId = typeChanged ? null : res.roomUnitId;
	if (roomUnitId && (arrivalChanged || next.checkOut !== res.checkOut)) {
		await lockAssignableUnit(db, { ...res, ...next }, roomUnitId);
	}

	const planDays = (await loadPlanDays(db, [plan.id], next.checkIn, next.checkOut)).get(plan.id ?? '') ?? NO_DAYS;
	const addedNights = newNights.filter((d) => !oldNights.includes(d));
	const planVerdict = evaluatePlan(plan, planDays, typeChanged || planChanged || arrivalChanged ? newNights : addedNights);
	if (!planVerdict.ok && (planVerdict.reason === 'PLAN_CLOSED' || arrivalChanged || typeChanged || planChanged)) throw conflict(planVerdict.message, { reason: planVerdict.reason });

	const dayRates = await moveInventory(
		db,
		actor.propertyId,
		{ roomTypeId: res.roomTypeId, nights: oldNights },
		{ roomTypeId: next.roomTypeId, nights: newNights },
		{ enforceMinLos: arrivalChanged || typeChanged }
	);
	const party = { adults: next.adults, children: next.children };
	const price = (date: string) => planNightPrice(dayRates.get(date)!, plan, planDays.get(date), party);

	// Rate snapshot: drop removed nights, add new ones at today's rate, optionally re-price kept ones.
	if (removed.length > 0) {
		await db.delete(reservationNight).where(and(eq(reservationNight.reservationId, res.id), inArray(reservationNight.date, removed)));
	}
	const added = addedNights;
	if (added.length > 0) {
		await db.insert(reservationNight).values(added.map((date) => ({ reservationId: res.id, date, rateCents: price(date) })));
	}
	if (input.repriceExisting || typeChanged || planChanged || partyChanged) {
		for (const date of newNights.filter((d) => !added.includes(d))) {
			await db
				.update(reservationNight)
				.set({ rateCents: price(date) })
				.where(and(eq(reservationNight.reservationId, res.id), eq(reservationNight.date, date)));
		}
	}
	const nights = await db.select({ date: reservationNight.date, rateCents: reservationNight.rateCents }).from(reservationNight).where(eq(reservationNight.reservationId, res.id));
	const quotedTotalCents = quoteStay(nights, await loadTaxRules(db, p), next.adults + next.children).totalCents;

	await db
		.update(reservation)
		.set({ ...next, roomUnitId, ratePlanId: plan.id, quotedTotalCents })
		.where(eq(reservation.id, res.id));

	await enqueueAri(db, p.id, res.roomTypeId, res.checkIn, res.checkOut);
	if (typeChanged || arrivalChanged || next.checkOut !== res.checkOut) await enqueueAri(db, p.id, next.roomTypeId, next.checkIn, next.checkOut);
	return { reservationId: res.id, quotedTotalCents };
};
