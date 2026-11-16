import { eq } from 'drizzle-orm';
import { reservation } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { conflict } from '$lib/server/cqrs/errors';
import { lockReservation } from '$lib/server/domain/reservations';
import { lockAssignableUnit } from '$lib/server/domain/rooms';
import type { AssignRoom } from './contract';

export const assignRoom: CommandHandler<typeof AssignRoom> = async ({ reservationId, roomUnitId }, { db, actor }) => {
	const res = await lockReservation(db, actor.propertyId, reservationId);
	if (res.status !== 'CONFIRMED') throw conflict('Rooms can only be (re)assigned before check-in');
	if (roomUnitId) await lockAssignableUnit(db, res, roomUnitId);
	await db.update(reservation).set({ roomUnitId }).where(eq(reservation.id, res.id));
	return { reservationId: res.id };
};
