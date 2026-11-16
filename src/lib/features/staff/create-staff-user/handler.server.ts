import { staffUser } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { conflict } from '$lib/server/cqrs/errors';
import { hashPassword } from '$lib/server/auth/password';
import { assertCanManageRole, lockStaffDirectory } from '../guards.server';
import type { CreateStaffUser } from './contract';

export const createStaffUser: CommandHandler<typeof CreateStaffUser> = async (input, { db, actor }) => {
	const passwordHash = await hashPassword(input.temporaryPassword);
	// Role checks use the FRESH set under the lock, never ctx.permissions.
	const fresh = await lockStaffDirectory(db, actor);
	await assertCanManageRole(db, actor, fresh, input.role);
	const [row] = await db
		.insert(staffUser)
		.values({
			propertyId: actor.propertyId,
			email: input.email,
			name: input.name,
			role: input.role,
			passwordHash,
			mustChangePassword: true
		})
		.onConflictDoNothing({ target: staffUser.email })
		.returning({ id: staffUser.id });
	if (!row) throw conflict('A user with this email already exists');
	return { staffUserId: row.id };
};
