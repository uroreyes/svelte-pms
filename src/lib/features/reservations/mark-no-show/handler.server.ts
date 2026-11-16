import type { CommandHandler } from '$lib/server/cqrs/execute';
import { conflict } from '$lib/server/cqrs/errors';
import { businessDate, loadProperty } from '$lib/server/domain/property';
import { lockReservation, markNoShow } from '$lib/server/domain/reservations';
import type { MarkNoShow } from './contract';

export const markNoShowHandler: CommandHandler<typeof MarkNoShow> = async ({ reservationId }, { db, actor, now }) => {
	const today = businessDate(await loadProperty(db, actor.propertyId), now);
	const res = await lockReservation(db, actor.propertyId, reservationId);
	if (res.checkIn > today) throw conflict(`The guest is not due until ${res.checkIn}`);
	await markNoShow(db, res, now);
	return { reservationId: res.id };
};
