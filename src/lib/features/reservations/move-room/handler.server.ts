import { and, eq, ne } from 'drizzle-orm';
import { addDays, nightsOf } from '$lib/shared/domain/dates';
import { reservation, roomUnit } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { conflict, invalid } from '$lib/server/cqrs/errors';
import { enqueueAri } from '$lib/server/domain/outbox';
import { businessDate, loadProperty } from '$lib/server/domain/property';
import { lockReservation, moveInventory } from '$lib/server/domain/reservations';
import { lockAssignableUnit } from '$lib/server/domain/rooms';
import type { MoveRoom } from './contract';

/**
 * In-house room move (maintenance issue, upgrade). Booked rates are kept (complimentary upgrade);
 * if the room type changes, the remaining nights' inventory moves with the guest.
 */
export const moveRoom: CommandHandler<typeof MoveRoom> = async ({ reservationId, roomUnitId, reason }, { db, actor, now }) => {
	const p = await loadProperty(db, actor.propertyId);
	const today = businessDate(p, now);
	const res = await lockReservation(db, actor.propertyId, reservationId);
	if (res.status !== 'CHECKED_IN') throw conflict('Only in-house guests can be moved — use room allocation before check-in');
	if (res.roomUnitId === roomUnitId) throw invalid('Guest is already in that room');

	const from = today > res.checkIn ? today : res.checkIn;
	const remaining = nightsOf(from, res.checkOut);
	const unit = await lockAssignableUnit(db, { ...res, checkIn: from, checkOut: remaining.length ? res.checkOut : addDays(from, 1) }, roomUnitId, { anyType: true });
	if (unit.housekeepingStatus !== 'CLEAN' && unit.housekeepingStatus !== 'INSPECTED') {
		throw conflict(`Room ${unit.roomNumber} is ${unit.housekeepingStatus.toLowerCase()} — it must be clean or inspected`);
	}
	const [occupied] = await db
		.select({ code: reservation.confirmationCode })
		.from(reservation)
		.where(and(eq(reservation.roomUnitId, unit.id), eq(reservation.status, 'CHECKED_IN'), ne(reservation.id, res.id)))
		.limit(1);
	if (occupied) throw conflict(`Room ${unit.roomNumber} is occupied (${occupied.code})`);

	const typeChanged = unit.roomTypeId !== res.roomTypeId;
	if (typeChanged && remaining.length > 0) {
		await moveInventory(db, p.id, { roomTypeId: res.roomTypeId, nights: remaining }, { roomTypeId: unit.roomTypeId, nights: remaining }, { enforceMinLos: false });
	}
	const [old] = res.roomUnitId ? await db.select({ n: roomUnit.roomNumber }).from(roomUnit).where(eq(roomUnit.id, res.roomUnitId)) : [];
	const note = `[${today}] Moved ${old ? `from room ${old.n} ` : ''}to room ${unit.roomNumber} by ${actor.name}: ${reason}`;
	await db
		.update(reservation)
		.set({ roomUnitId: unit.id, roomTypeId: unit.roomTypeId, notes: res.notes ? `${res.notes}\n${note}` : note })
		.where(eq(reservation.id, res.id));
	if (res.roomUnitId) await db.update(roomUnit).set({ housekeepingStatus: 'DIRTY' }).where(eq(roomUnit.id, res.roomUnitId));
	if (typeChanged && remaining.length > 0) {
		await enqueueAri(db, p.id, res.roomTypeId, from, res.checkOut);
		await enqueueAri(db, p.id, unit.roomTypeId, from, res.checkOut);
	}
	return { reservationId: res.id, roomNumber: unit.roomNumber };
};
