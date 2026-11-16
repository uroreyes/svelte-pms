import { loadTaxRules } from '$lib/server/domain/taxes';
import { and, eq, ne } from 'drizzle-orm';
import { nightsOf } from '$lib/shared/domain/dates';
import { guest, reservation } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { conflict, invalid } from '$lib/server/cqrs/errors';
import { lockReservationFolios, openFolio, postRoomNights } from '$lib/server/domain/folio';
import { businessDate, loadProperty } from '$lib/server/domain/property';
import { lockReservation } from '$lib/server/domain/reservations';
import { lockAssignableUnit } from '$lib/server/domain/rooms';
import { encryptField, type PiiKeyring } from '$lib/server/security/crypto';
import { idDocumentLast4 } from '$lib/shared/domain/id-document';
import type { CheckIn } from './contract';

export function makeCheckIn(keyring: () => PiiKeyring): CommandHandler<typeof CheckIn> {
	return async (input, { db, actor, now }) => {
		const ring = keyring();
		const p = await loadProperty(db, actor.propertyId);
		const today = businessDate(p, now);
		const res = await lockReservation(db, actor.propertyId, input.reservationId);

		if (res.status !== 'CONFIRMED') throw conflict(`Cannot check in a reservation that is ${res.status}`);
		if (res.checkIn > today) throw conflict(`Arrival date is ${res.checkIn} — today is ${today}`);
		if (res.checkOut <= today) throw conflict('The stay dates for this reservation have passed');

		const roomUnitId = input.roomUnitId ?? res.roomUnitId;
		if (!roomUnitId) throw invalid('Select a room to check the guest into');
		const unit = await lockAssignableUnit(db, res, roomUnitId);
		if (unit.housekeepingStatus !== 'CLEAN' && unit.housekeepingStatus !== 'INSPECTED') {
			throw conflict(`Room ${unit.roomNumber} is ${unit.housekeepingStatus.toLowerCase()} — it must be clean or inspected`);
		}
		const [occupied] = await db
			.select({ code: reservation.confirmationCode })
			.from(reservation)
			.where(and(eq(reservation.roomUnitId, unit.id), eq(reservation.status, 'CHECKED_IN'), ne(reservation.id, res.id)))
			.limit(1);
		if (occupied) throw conflict(`Room ${unit.roomNumber} is still occupied (${occupied.code})`);

		await db
			.update(reservation)
			.set({
				status: 'CHECKED_IN',
				roomUnitId: unit.id,
				checkedInAt: now,
				depositCents: input.depositCents ?? null,
				depositReference: input.depositReference ?? null
			})
			.where(eq(reservation.id, res.id));
		const [g] = await db
			.update(guest)
			.set({
				idDocumentType: input.idDocumentType,
				idDocumentNumber: encryptField(ring, input.idDocumentNumber, `guest:${res.guestId}`),
				idDocumentLast4: idDocumentLast4(input.idDocumentNumber)
			})
			.where(eq(guest.id, res.guestId))
			.returning({ firstName: guest.firstName, lastName: guest.lastName });

		const folioId = await openFolio(db, {
			propertyId: p.id,
			reservationId: res.id,
			label: 'Guest',
			payerName: `${g!.firstName} ${g!.lastName}`,
			isPrimary: true,
			receivesRoomCharges: true
		});

		// UPFRONT: whole stay now. NIGHTLY: only nights already elapsed (late arrival); the rest via night audit.
		const nights = nightsOf(res.checkIn, res.checkOut);
		const dates = p.roomPostingMode === 'UPFRONT' ? nights : nights.filter((d) => d < today);
		const folios = await lockReservationFolios(db, res.id);
		const postedNights = await postRoomNights(db, {
			reservation: { ...res, roomUnitId: unit.id },
			folios,
			dates,
			taxRules: await loadTaxRules(db, p),
			staffUserId: actor.userId
		});

		return { reservationId: res.id, folioId, postedNights };
	};
}
