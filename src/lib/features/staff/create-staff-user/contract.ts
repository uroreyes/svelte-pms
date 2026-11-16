import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { staffEmail, staffName, staffPassword } from '$lib/shared/cqrs/schemas';
import { STAFF_ROLES } from '$lib/shared/domain/enums';

export const CreateStaffUser = command<{ staffUserId: string }>()({
	name: 'staff.create',
	path: '/api/staff/create',
	permission: 'staff.manage',
	input: z.object({
		email: staffEmail,
		name: staffName,
		role: z.enum(STAFF_ROLES),
		temporaryPassword: staffPassword
	})
});
