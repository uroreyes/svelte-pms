import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, staffName } from '$lib/shared/cqrs/schemas';
import { STAFF_ROLES } from '$lib/shared/domain/enums';

export const UpdateStaffUser = command<{ staffUserId: string; sessionsRevoked: number }>()({
	name: 'staff.update',
	path: '/api/staff/update',
	permission: 'staff.manage',
	input: z
		.object({
			staffUserId: id,
			name: staffName.optional(),
			role: z.enum(STAFF_ROLES).optional(),
			active: z.boolean().optional()
		})
		.refine((v) => v.name !== undefined || v.role !== undefined || v.active !== undefined, {
			message: 'Nothing to update'
		})
});
