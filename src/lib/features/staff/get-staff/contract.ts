import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import type { StaffRole } from '$lib/shared/domain/enums';

export interface StaffRow {
	staffUserId: string;
	name: string;
	email: string;
	role: StaffRole;
	active: boolean;
	mustChangePassword: boolean;
	/** ISO timestamp */
	createdAt: string;
	isSelf: boolean;
	/** Advisory only: commands re-check under lock. */
	manageable: boolean;
}

export interface StaffView {
	timezone: string;
	users: StaffRow[];
	assignableRoles: StaffRole[];
}

export const GetStaff = query<StaffView>()({
	name: 'staff.list',
	path: '/api/staff',
	permission: 'staff.manage',
	input: z.object({})
});
