import { eq } from 'drizzle-orm';
import { folio } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { conflict } from '$lib/server/cqrs/errors';
import { lockReservationFolios, openFolio } from '$lib/server/domain/folio';
import { lockReservation } from '$lib/server/domain/reservations';
import type { OpenSplitFolio } from './contract';

export const openSplitFolio: CommandHandler<typeof OpenSplitFolio> = async (input, { db, actor }) => {
	const res = await lockReservation(db, actor.propertyId, input.reservationId);
	if (res.status !== 'CHECKED_IN') throw conflict('Split folios can be opened for in-house guests only');
	const folios = await lockReservationFolios(db, res.id);
	if (folios.length >= 5) throw conflict('A reservation can have at most 5 folios');
	if (input.routeRoomCharges) await db.update(folio).set({ receivesRoomCharges: false }).where(eq(folio.reservationId, res.id));
	const folioId = await openFolio(db, {
		propertyId: actor.propertyId,
		reservationId: res.id,
		label: input.label,
		payerName: input.payerName,
		isPrimary: false,
		receivesRoomCharges: input.routeRoomCharges
	});
	return { folioId };
};
