import { loadTaxRules } from '$lib/server/domain/taxes';
import { nightsOf } from '$lib/shared/domain/dates';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { conflict } from '$lib/server/cqrs/errors';
import { lockReservationFolios, postRoomNights } from '$lib/server/domain/folio';
import { loadProperty } from '$lib/server/domain/property';
import { lockReservation } from '$lib/server/domain/reservations';
import type { PostRoomCharges } from './contract';

export const postRoomCharges: CommandHandler<typeof PostRoomCharges> = async ({ reservationId, through }, { db, actor }) => {
	const res = await lockReservation(db, actor.propertyId, reservationId);
	if (res.status !== 'CHECKED_IN') throw conflict('Room charges post to in-house guests only');
	const p = await loadProperty(db, actor.propertyId);
	const folios = await lockReservationFolios(db, res.id);
	const dates = nightsOf(res.checkIn, res.checkOut).filter((d) => !through || d <= through);
	return { posted: await postRoomNights(db, { reservation: res, folios, dates, taxRules: await loadTaxRules(db, p), staffUserId: actor.userId }) };
};
