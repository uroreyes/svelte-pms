import { eq } from 'drizzle-orm';
import { staffUser } from '$lib/server/db/schema';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { invalid } from '$lib/server/cqrs/errors';
import { revokeUserSessions } from '$lib/server/auth/session';
import { assertAnotherActiveAdmin, assertCanManageRole, lockStaffDirectory, lockTarget } from '../guards.server';
import type { UpdateStaffUser } from './contract';

export const updateStaffUser: CommandHandler<typeof UpdateStaffUser> = async (input, { db, actor }) => {
	const fresh = await lockStaffDirectory(db, actor);
	const target = await lockTarget(db, actor, input.staffUserId);
	const { name, role, active } = input;
	const isSelf = target.id === actor.userId;

	if (isSelf && ((role !== undefined && role !== target.role) || active === false)) {
		throw invalid('You cannot change your own role or deactivate yourself');
	}
	if (!isSelf) await assertCanManageRole(db, actor, fresh, target.role);
	if (role !== undefined && role !== target.role) await assertCanManageRole(db, actor, fresh, role);

	if (target.role === 'ADMIN' && target.active && ((role ?? 'ADMIN') !== 'ADMIN' || active === false)) {
		await assertAnotherActiveAdmin(db, actor.propertyId, target.id);
	}

	const patch: Partial<typeof staffUser.$inferInsert> = {};
	if (name !== undefined) patch.name = name;
	if (role !== undefined) patch.role = role;
	if (active !== undefined) patch.active = active;
	await db.update(staffUser).set(patch).where(eq(staffUser.id, target.id));

	const sessionsRevoked = target.active && active === false ? await revokeUserSessions(db, target.id) : 0;
	return { staffUserId: target.id, sessionsRevoked };
};
