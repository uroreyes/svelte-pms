import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import { isoDate } from '$lib/shared/cqrs/schemas';
import type { ReservationSource } from '$lib/shared/domain/enums';

export interface DashboardView {
	from: string;
	to: string;
	currency: string;
	kpis: {
		totalAvailableRoomNights: number;
		roomsSold: number;
		roomRevenueCents: number;
		occupancyPct: number;
		adrCents: number;
		revparCents: number;
	};
	daily: { date: string; roomsSold: number; available: number; occupancyPct: number; roomRevenueCents: number }[];
	revenue: { roomCents: number; addOnCents: number; byCategory: { category: string; cents: number }[] };
	channels: { source: ReservationSource; reservations: number; roomNights: number; revenueCents: number; adrCents: number }[];
}

export const GetDashboard = query<DashboardView>()({
	name: 'insights.dashboard',
	path: '/api/insights/dashboard',
	permission: 'insights.view',
	input: z
		.object({ from: isoDate.optional(), to: isoDate.optional() })
		.refine((v) => !v.from || !v.to || v.to >= v.from, { message: 'End must be on or after start', path: ['to'] })
});
