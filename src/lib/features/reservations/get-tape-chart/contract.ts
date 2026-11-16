import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import { isoDate, qsInt } from '$lib/shared/cqrs/schemas';
import type { HousekeepingStatus, ReservationStatus } from '$lib/shared/domain/enums';

export interface TapeBar {
	kind: 'reservation' | 'block';
	id: string;
	label: string;
	status: ReservationStatus | 'MAINTENANCE';
	/** column index into `dates` (0-based) */
	startCol: number;
	span: number;
	continuesBefore: boolean;
	continuesAfter: boolean;
	overbooked: boolean;
	checkIn: string;
	checkOut: string;
}

export interface TapeChartView {
	start: string;
	days: number;
	businessDate: string;
	dates: { date: string; dow: number }[];
	groups: {
		roomType: { id: string; name: string };
		rooms: { id: string; roomNumber: string; housekeepingStatus: HousekeepingStatus; bars: TapeBar[] }[];
		/** Unallocated reservations packed into non-overlapping lanes. */
		unallocated: TapeBar[][];
	}[];
}

export const GetTapeChart = query<TapeChartView>()({
	name: 'reservations.tapeChart',
	path: '/api/reservations/tape-chart',
	permission: 'tapeChart.view',
	input: z.object({ start: isoDate.optional(), days: qsInt(7, 31).default(14) })
});
