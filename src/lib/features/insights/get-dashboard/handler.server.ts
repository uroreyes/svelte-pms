import { and, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { addDays, diffDays, expandRange, overlaps } from '$lib/shared/domain/dates';
import { folio, folioItem, reservation, reservationNight, roomBlock, roomUnit } from '$lib/server/db/schema';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import { invalid } from '$lib/server/cqrs/errors';
import { businessDate, loadProperty } from '$lib/server/domain/property';
import { kpis } from '../kpi';
import type { GetDashboard } from './contract';

const SOLD = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] as const;

export const getDashboard: QueryHandler<typeof GetDashboard> = async (input, { db, actor, now }) => {
	const p = await loadProperty(db, actor.propertyId);
	const today = businessDate(p, now);
	const to = input.to ?? today;
	const from = input.from ?? addDays(to, -29);
	if (diffDays(from, to) > 366) throw invalid('Range is limited to one year');
	const dates = expandRange(from, to);

	const [[units], blocks, nightRows, channelRows, folioRows] = await Promise.all([
		db.select({ n: sql<number>`count(*)::int` }).from(roomUnit).where(eq(roomUnit.propertyId, p.id)),
		db.select().from(roomBlock).where(eq(roomBlock.propertyId, p.id)),
		db
			.select({ date: reservationNight.date, sold: sql<number>`count(*)::int`, revenue: sql<number>`coalesce(sum(${reservationNight.rateCents}),0)::int` })
			.from(reservationNight)
			.innerJoin(reservation, eq(reservation.id, reservationNight.reservationId))
			.where(and(eq(reservation.propertyId, p.id), inArray(reservation.status, [...SOLD]), gte(reservationNight.date, from), lte(reservationNight.date, to)))
			.groupBy(reservationNight.date),
		db
			.select({
				source: reservation.source,
				reservations: sql<number>`count(distinct ${reservation.id})::int`,
				roomNights: sql<number>`count(*)::int`,
				revenue: sql<number>`coalesce(sum(${reservationNight.rateCents}),0)::int`
			})
			.from(reservationNight)
			.innerJoin(reservation, eq(reservation.id, reservationNight.reservationId))
			.where(and(eq(reservation.propertyId, p.id), inArray(reservation.status, [...SOLD]), gte(reservationNight.date, from), lte(reservationNight.date, to)))
			.groupBy(reservation.source),
		db
			.select({ type: folioItem.type, category: folioItem.category, cents: sql<number>`coalesce(sum(${folioItem.amountCents}),0)::int` })
			.from(folioItem)
			.innerJoin(folio, eq(folio.id, folioItem.folioId))
			.where(
				and(
					eq(folio.propertyId, p.id),
					sql`(${folioItem.postedAt} AT TIME ZONE ${p.timezone})::date BETWEEN ${from}::date AND ${to}::date`,
					ne(folioItem.type, 'TAX')
				)
			)
			.groupBy(folioItem.type, folioItem.category)
	]);

	const unitCount = units?.n ?? 0;
	const byDate = new Map(nightRows.map((r) => [r.date, r]));
	const daily = dates.map((date) => {
		const blocked = blocks.filter((b) => overlaps(b.startDate, b.endDate, date, addDays(date, 1))).length;
		const available = Math.max(0, unitCount - blocked);
		const row = byDate.get(date);
		const sold = row?.sold ?? 0;
		return { date, roomsSold: sold, available, occupancyPct: kpis(sold, available, 0).occupancyPct, roomRevenueCents: row?.revenue ?? 0 };
	});

	const totalAvailable = daily.reduce((s, d) => s + d.available, 0);
	const roomsSold = daily.reduce((s, d) => s + d.roomsSold, 0);
	const roomRevenueCents = daily.reduce((s, d) => s + d.roomRevenueCents, 0);
	const addOns = folioRows.filter((r) => r.type !== 'ROOM');

	return {
		from,
		to,
		currency: p.currency,
		kpis: { totalAvailableRoomNights: totalAvailable, roomsSold, roomRevenueCents, ...kpis(roomsSold, totalAvailable, roomRevenueCents) },
		daily,
		revenue: {
			roomCents: folioRows.filter((r) => r.type === 'ROOM').reduce((s, r) => s + r.cents, 0),
			addOnCents: addOns.reduce((s, r) => s + r.cents, 0),
			byCategory: addOns.map((r) => ({ category: r.category, cents: r.cents })).sort((a, b) => b.cents - a.cents)
		},
		channels: channelRows
			.map((c) => ({ source: c.source, reservations: c.reservations, roomNights: c.roomNights, revenueCents: c.revenue, adrCents: c.roomNights ? Math.round(c.revenue / c.roomNights) : 0 }))
			.sort((a, b) => b.revenueCents - a.revenueCents)
	};
};
