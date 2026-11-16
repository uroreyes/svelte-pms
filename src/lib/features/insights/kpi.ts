/** Pure hospitality KPI math (unit-tested). */
export function kpis(roomsSold: number, availableRoomNights: number, roomRevenueCents: number) {
	const occupancy = availableRoomNights > 0 ? roomsSold / availableRoomNights : 0;
	const adrCents = roomsSold > 0 ? Math.round(roomRevenueCents / roomsSold) : 0;
	const revparCents = availableRoomNights > 0 ? Math.round(roomRevenueCents / availableRoomNights) : 0;
	return { occupancyPct: Math.round(occupancy * 1000) / 10, adrCents, revparCents };
}
