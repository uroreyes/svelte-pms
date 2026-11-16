import { and, eq } from 'drizzle-orm';
import { staffUser } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { invalid, unauthenticated } from '$lib/server/cqrs/errors';
import { hashPassword, verifyPassword } from '$lib/server/auth/password';
import { revokeUserSessions } from '$lib/server/auth/session';
import type { ChangeOwnPassword } from './contract';

export const changeOwnPassword: CommandHandler<typeof ChangeOwnPassword> = async (input, { db, actor }) => {
	const [row] = await db
		.select({ id: staffUser.id, passwordHash: staffUser.passwordHash })
		.from(staffUser)
		.where(and(eq(staffUser.id, actor.userId), eq(staffUser.propertyId, actor.propertyId), eq(staffUser.active, true), eq(staffUser.isSystem, false)))
		.for('no key update');
	if (!row) throw unauthenticated();
	if (!(await verifyPassword(input.currentPassword, row.passwordHash))) throw invalid('Current password is incorrect');

	const passwordHash = await hashPassword(input.newPassword);
	await db
		.update(staffUser)
		.set({ passwordHash, mustChangePassword: false })
		.where(and(eq(staffUser.id, actor.userId), eq(staffUser.propertyId, actor.propertyId)));
	const sessionsRevoked = await revokeUserSessions(db, actor.userId, { except: actor.sessionId });
	return { staffUserId: actor.userId, sessionsRevoked };
};
