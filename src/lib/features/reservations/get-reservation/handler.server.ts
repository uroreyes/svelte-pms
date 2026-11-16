import { and, asc, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm';
import { diffDays } from '$lib/shared/domain/dates';
import { maskIdDocument } from '$lib/shared/domain/id-document';
import { booking, guest, ratePlan, reservation, roomBlock, roomType, roomUnit } from '$lib/server/db/schema';
import { plansForTypes } from '$lib/server/domain/rate-plans';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import { notFound } from '$lib/server/cqrs/errors';
import { businessDate, loadProperty } from '$lib/server/domain/property';
import type { GetReservation, ReservationDetailView } from './contract';

export const getReservation: QueryHandler<typeof GetReservation> = async ({ reservationId }, { db, actor, now }) => {
	const [row] = await db
		.select({
			r: reservation,
			g: {
				firstName: guest.firstName,
				lastName: guest.lastName,
				email: guest.email,
				phone: guest.phone,
				idDocumentType: guest.idDocumentType,
				idDocumentLast4: guest.idDocumentLast4,
				hasIdDocument: sql<boolean>`${guest.idDocumentNumber} IS NOT NULL`
			},
			typeName: roomType.name,
			unit: roomUnit
		})
		.from(reservation)
		.innerJoin(guest, eq(guest.id, reservation.guestId))
		.innerJoin(roomType, eq(roomType.id, reservation.roomTypeId))
		.leftJoin(roomUnit, eq(roomUnit.id, reservation.roomUnitId))
		.where(and(eq(reservation.id, reservationId), eq(reservation.propertyId, actor.propertyId)));
	if (!row) throw notFound('Reservation');
	const { r, g, unit } = row;
	const p = await loadProperty(db, actor.propertyId);
	const today = businessDate(p, now);

	const [units, busy, blocks] = await Promise.all([
		db.select().from(roomUnit).where(eq(roomUnit.roomTypeId, r.roomTypeId)).orderBy(asc(roomUnit.roomNumber)),
		db
			.select({ roomUnitId: reservation.roomUnitId })
			.from(reservation)
			.where(
				and(
					eq(reservation.roomTypeId, r.roomTypeId),
					ne(reservation.id, r.id),
					inArray(reservation.status, ['CONFIRMED', 'CHECKED_IN']),
					lt(reservation.checkIn, r.checkOut),
					gt(reservation.checkOut, r.checkIn)
				)
			),
		db
			.select({ roomUnitId: roomBlock.roomUnitId })
			.from(roomBlock)
			.where(and(eq(roomBlock.propertyId, actor.propertyId), lt(roomBlock.startDate, r.checkOut), gt(roomBlock.endDate, r.checkIn)))
	]);
	const taken = new Set([...busy.map((b) => b.roomUnitId), ...blocks.map((b) => b.roomUnitId)]);

	const types = await db.select({ id: roomType.id, name: roomType.name, maxOccupancy: roomType.maxOccupancy }).from(roomType).where(eq(roomType.propertyId, actor.propertyId)).orderBy(asc(roomType.name));
	const plans = await plansForTypes(db, actor.propertyId, types);
	const currentPlan = (plans.get(r.roomTypeId) ?? []).find((pl) => pl.id === r.ratePlanId) ?? (r.ratePlanId ? (await db.select().from(ratePlan).where(eq(ratePlan.id, r.ratePlanId)))[0] : undefined);
	let bookingView: ReservationDetailView['reservation']['booking'] = null;
	if (r.bookingId) {
		const [b] = await db.select().from(booking).where(eq(booking.id, r.bookingId));
		const siblings = await db
			.select({ id: reservation.id, confirmationCode: reservation.confirmationCode, status: reservation.status, roomTypeName: roomType.name })
			.from(reservation)
			.innerJoin(roomType, eq(roomType.id, reservation.roomTypeId))
			.where(eq(reservation.bookingId, r.bookingId))
			.orderBy(asc(reservation.createdAt));
		if (b && siblings.length > 1) bookingView = { code: b.confirmationCode, rooms: siblings };
	}
	let moveTargets: ReservationDetailView['moveTargets'] = [];
	if (r.status === 'CHECKED_IN') {
		const from = today > r.checkIn ? today : r.checkIn;
		const [all, busyAll, blocksAll] = await Promise.all([
			db.select({ u: roomUnit, typeName: roomType.name }).from(roomUnit).innerJoin(roomType, eq(roomType.id, roomUnit.roomTypeId)).where(eq(roomUnit.propertyId, actor.propertyId)).orderBy(asc(roomUnit.roomNumber)),
			db
				.select({ roomUnitId: reservation.roomUnitId })
				.from(reservation)
				.where(and(eq(reservation.propertyId, actor.propertyId), ne(reservation.id, r.id), inArray(reservation.status, ['CONFIRMED', 'CHECKED_IN']), lt(reservation.checkIn, r.checkOut), gt(reservation.checkOut, from))),
			db.select({ roomUnitId: roomBlock.roomUnitId }).from(roomBlock).where(and(eq(roomBlock.propertyId, actor.propertyId), lt(roomBlock.startDate, r.checkOut), gt(roomBlock.endDate, from)))
		]);
		const takenAll = new Set([...busyAll.map((b) => b.roomUnitId), ...blocksAll.map((b) => b.roomUnitId)]);
		moveTargets = all
			.filter(({ u }) => u.id !== r.roomUnitId)
			.map(({ u, typeName }) => ({
				id: u.id,
				roomNumber: u.roomNumber,
				roomTypeName: typeName,
				housekeepingStatus: u.housekeepingStatus,
				ready: u.housekeepingStatus === 'CLEAN' || u.housekeepingStatus === 'INSPECTED',
				free: !takenAll.has(u.id)
			}));
	}

	const blockers: string[] = [];
	if (r.status !== 'CONFIRMED') blockers.push(`Reservation is ${r.status.replace('_', ' ').toLowerCase()}`);
	if (r.checkIn > today) blockers.push(`Arrival is ${r.checkIn}; today is ${today}`);
	if (r.checkOut <= today) blockers.push('Stay dates are in the past');

	return {
		businessDate: today,
		currency: p.currency,
		reservation: {
			id: r.id,
			confirmationCode: r.confirmationCode,
			status: r.status,
			source: r.source,
			externalRef: r.externalRef,
			checkIn: r.checkIn,
			checkOut: r.checkOut,
			nights: diffDays(r.checkIn, r.checkOut),
			adults: r.adults,
			children: r.children,
			quotedTotalCents: r.quotedTotalCents,
			overbooked: r.overbooked,
			notes: r.notes,
			depositCents: r.depositCents,
			depositReference: r.depositReference,
			roomType: { id: r.roomTypeId, name: row.typeName },
			ratePlan: { id: r.ratePlanId, name: currentPlan?.name ?? 'Standard rate', refundable: currentPlan?.refundable ?? true, breakfastIncluded: currentPlan?.breakfastIncluded ?? false },
			booking: bookingView,
			room: unit ? { id: unit.id, roomNumber: unit.roomNumber, housekeepingStatus: unit.housekeepingStatus } : null
		},
		guest: {
			firstName: g.firstName,
			lastName: g.lastName,
			email: g.email,
			phone: g.phone,
			idDocumentType: g.idDocumentType,
			idDocumentMasked: maskIdDocument(g.hasIdDocument, g.idDocumentLast4)
		},
		rooms: units.map((u) => ({
			id: u.id,
			roomNumber: u.roomNumber,
			housekeepingStatus: u.housekeepingStatus,
			ready: u.housekeepingStatus === 'CLEAN' || u.housekeepingStatus === 'INSPECTED',
			free: !taken.has(u.id)
		})),
		checkInBlockers: blockers,
		roomTypes: types.map((t) => ({ ...t, plans: (plans.get(t.id) ?? []).map((pl) => ({ id: pl.id, name: pl.name })) })),
		moveTargets
	};
};
