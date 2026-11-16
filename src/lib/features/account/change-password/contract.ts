import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { staffPassword } from '$lib/shared/cqrs/schemas';
import { PASSWORD_MAX_LENGTH } from '$lib/shared/domain/staff';

export const ChangeOwnPassword = command<{ staffUserId: string; sessionsRevoked: number }>()({
	name: 'account.changePassword',
	path: '/api/account/password',
	permission: 'authenticated',
	input: z
		.object({
			currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
			newPassword: staffPassword
		})
		.refine((v) => v.newPassword.normalize('NFKC') !== v.currentPassword.normalize('NFKC'), {
			path: ['newPassword'],
			message: 'New password must differ from the current one'
		})
});
