import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { id, staffPassword } from '$lib/shared/cqrs/schemas';

export const ResetStaffPassword = command<{ staffUserId: string; sessionsRevoked: number }>()({
	name: 'staff.resetPassword',
	path: '/api/staff/reset-password',
	permission: 'staff.manage',
	input: z.object({ staffUserId: id, temporaryPassword: staffPassword })
});
