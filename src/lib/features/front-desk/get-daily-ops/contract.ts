import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import { isoDate } from '$lib/shared/cqrs/schemas';
import type { ReservationSource, ReservationStatus } from '$lib/shared/domain/enums';

export interface OpsRow {
	reservationId: string;
	confirmationCode: string;
	guestName: string;
	roomTypeName: string;
	roomNumber: string | null;
	checkIn: string;
	checkOut: string;
	status: ReservationStatus;
	source: ReservationSource;
	adults: number;
	children: number;
	balanceCents: number;
}

export interface DailyOpsView {
	date: string;
	businessDate: string;
	currency: string;
	arrivals: OpsRow[];
	departures: OpsRow[];
	inHouse: OpsRow[];
	/** Checked in past their departure date — not billed until extended or checked out. */
	overstays: OpsRow[];
	/** Confirmed arrivals from earlier dates that never checked in (night audit marks them NO_SHOW). */
	pendingNoShows: OpsRow[];
}

export const GetDailyOps = query<DailyOpsView>()({
	name: 'frontDesk.dailyOps',
	path: '/api/front-desk/daily-ops',
	permission: 'frontDesk.view',
	input: z.object({ date: isoDate.optional() })
});
