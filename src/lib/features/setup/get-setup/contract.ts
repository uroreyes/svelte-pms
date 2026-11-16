import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import type { ChargeCategory, HousekeepingStatus, RateAdjustment, RoomPostingMode, TaxKind, TaxScope } from '$lib/shared/domain/enums';

export interface SetupView {
	property: {
		id: string;
		slug: string;
		name: string;
		address: string;
		currency: string;
		timezone: string;
		roomPostingMode: RoomPostingMode;
	};
	roomTypes: {
		id: string;
		name: string;
		baseRateCents: number;
		baseOccupancy: number;
		maxOccupancy: number;
		amenities: string[];
		units: { id: string; roomNumber: string; floor: number; housekeepingStatus: HousekeepingStatus }[];
		ratePlans: RatePlanView[];
	}[];
	taxRules: { id: string; name: string; kind: TaxKind; rateBp: number; amountCents: number; appliesTo: TaxScope; inclusive: boolean; sortOrder: number; active: boolean }[];
	catalog: { id: string; category: ChargeCategory; name: string; unitPriceCents: number; taxable: boolean; active: boolean }[];
}

export interface RatePlanView {
	id: string;
	roomTypeId: string;
	name: string;
	code: string;
	description: string;
	adjustmentKind: RateAdjustment;
	adjustmentValue: number;
	includedOccupancy: number;
	extraAdultCents: number;
	extraChildCents: number;
	refundable: boolean;
	freeCancellationDays: number | null;
	breakfastIncluded: boolean;
	minLos: number | null;
	isDefault: boolean;
	active: boolean;
}

export const GetSetup = query<SetupView>()({
	name: 'setup.get',
	path: '/api/setup',
	permission: 'setup.manage',
	input: z.object({})
});
