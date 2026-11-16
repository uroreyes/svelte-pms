import { eq } from 'drizzle-orm';
import { staffUser } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/auth/password';
import { revokeUserSessions } from '$lib/server/auth/session';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { invalid } from '$lib/server/cqrs/errors';
import { assertCanManageRole, lockStaffDirectory, lockTarget } from '../guards.server';
import type { ResetStaffPassword } from './contract';

export const resetStaffPassword: CommandHandler<typeof ResetStaffPassword> = async (input, { db, actor }) => {
	const passwordHash = await hashPassword(input.temporaryPassword);
	const fresh = await lockStaffDirectory(db, actor);
	const target = await lockTarget(db, actor, input.staffUserId);
	if (target.id === actor.userId) throw invalid('Use "Change password" to change your own password');
	await assertCanManageRole(db, actor, fresh, target.role);
	await db.update(staffUser).set({ passwordHash, mustChangePassword: true }).where(eq(staffUser.id, target.id));
	const sessionsRevoked = await revokeUserSessions(db, target.id);
	return { staffUserId: target.id, sessionsRevoked };
};
