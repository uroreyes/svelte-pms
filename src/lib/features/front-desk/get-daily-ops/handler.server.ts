import { and, asc, eq, gt, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { folio, guest, reservation, roomType, roomUnit } from '$lib/server/db/schema';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import { businessDate, loadProperty } from '$lib/server/domain/property';
import type { GetDailyOps, OpsRow } from './contract';

export const getDailyOps: QueryHandler<typeof GetDailyOps> = async (input, { db, actor, now }) => {
	const p = await loadProperty(db, actor.propertyId);
	const today = businessDate(p, now);
	const date = input.date ?? today;

	const balances = db
		.select({ reservationId: folio.reservationId, balance: sql<number>`coalesce(sum(${folio.balanceCents}), 0)::int`.as('balance') })
		.from(folio)
		.groupBy(folio.reservationId)
		.as('balances');

	const rows = await db
		.select({
			r: reservation,
			first: guest.firstName,
			last: guest.lastName,
			typeName: roomType.name,
			roomNumber: roomUnit.roomNumber,
			balance: balances.balance
		})
		.from(reservation)
		.innerJoin(guest, eq(guest.id, reservation.guestId))
		.innerJoin(roomType, eq(roomType.id, reservation.roomTypeId))
		.leftJoin(roomUnit, eq(roomUnit.id, reservation.roomUnitId))
		.leftJoin(balances, eq(balances.reservationId, reservation.id))
		.where(
			and(
				eq(reservation.propertyId, p.id),
				inArray(reservation.status, ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT']),
				or(eq(reservation.checkIn, date), eq(reservation.checkOut, date), and(lte(reservation.checkIn, date), gt(reservation.checkOut, date)), eq(reservation.status, 'CHECKED_IN'), and(eq(reservation.status, 'CONFIRMED'), lt(reservation.checkIn, date)))
			)
		)
		.orderBy(asc(guest.lastName));

	const toRow = (x: (typeof rows)[number]): OpsRow => ({
		reservationId: x.r.id,
		confirmationCode: x.r.confirmationCode,
		guestName: `${x.last}, ${x.first}`,
		roomTypeName: x.typeName,
		roomNumber: x.roomNumber,
		checkIn: x.r.checkIn,
		checkOut: x.r.checkOut,
		status: x.r.status,
		source: x.r.source,
		adults: x.r.adults,
		children: x.r.children,
		balanceCents: x.balance ?? 0
	});

	return {
		date,
		businessDate: today,
		currency: p.currency,
		arrivals: rows.filter((x) => x.r.checkIn === date && x.r.status !== 'CHECKED_OUT').map(toRow),
		departures: rows.filter((x) => x.r.checkOut === date && x.r.status !== 'CONFIRMED').map(toRow),
		inHouse: rows.filter((x) => x.r.status === 'CHECKED_IN').map(toRow),
		overstays: rows.filter((x) => x.r.status === 'CHECKED_IN' && x.r.checkOut < date).map(toRow),
		pendingNoShows: rows.filter((x) => x.r.status === 'CONFIRMED' && x.r.checkIn < date).map(toRow)
	};
};
