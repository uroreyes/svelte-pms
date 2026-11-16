import { and, count, eq, ne } from 'drizzle-orm';
import { staffUser } from '$lib/server/db/schema';
import type { Tx } from '$lib/server/db/client';
import { loadPermissions, lockPermissionMatrix } from '$lib/server/domain/permissions';
import { conflict, forbidden, notFound } from '$lib/server/cqrs/errors';
import type { Actor } from '$lib/server/cqrs/actor';
import { STAFF_ROLE_LABEL, type StaffRole } from '$lib/shared/domain/enums';
import type { PermissionKey } from '$lib/shared/domain/permissions';
import { canManageRole } from '$lib/shared/domain/staff';

export type StaffTarget = { id: string; role: StaffRole; active: boolean };

/**
 * Lock order step 1-2: property row, then FRESH permissions of the actor's role.
 * `ctx.permissions` is loaded before the transaction and the lock, so a concurrent
 * grid save may have made it stale; callers must use only the returned set.
 */
export async function lockStaffDirectory(db: Tx, actor: Actor): Promise<ReadonlySet<PermissionKey>> {
	await lockPermissionMatrix(db, actor.propertyId);
	const fresh = await loadPermissions(db, actor.propertyId, actor.role);
	if (!fresh.has('staff.manage')) throw forbidden();
	return fresh;
}

/** Lock order step 3: the target row. System user is never addressable. */
export async function lockTarget(db: Tx, actor: Actor, staffUserId: string): Promise<StaffTarget> {
	const [row] = await db
		.select({ id: staffUser.id, role: staffUser.role, active: staffUser.active })
		.from(staffUser)
		.where(and(eq(staffUser.id, staffUserId), eq(staffUser.propertyId, actor.propertyId), eq(staffUser.isSystem, false)))
		.for('no key update');
	if (!row) throw notFound('Staff user');
	return row;
}

/** Actor may manage `role` only if the actor holds every permission of that role. */
export async function assertCanManageRole(
	db: Tx,
	actor: Actor,
	fresh: ReadonlySet<PermissionKey>,
	role: StaffRole
): Promise<void> {
	const rolePerms = await loadPermissions(db, actor.propertyId, role);
	if (!canManageRole(fresh, rolePerms)) throw forbidden(`You cannot manage ${STAFF_ROLE_LABEL[role]} users`);
}

export async function assertAnotherActiveAdmin(db: Tx, propertyId: string, excludeUserId: string): Promise<void> {
	const [row] = await db
		.select({ n: count() })
		.from(staffUser)
		.where(
			and(
				eq(staffUser.propertyId, propertyId),
				eq(staffUser.role, 'ADMIN'),
				eq(staffUser.active, true),
				eq(staffUser.isSystem, false),
				ne(staffUser.id, excludeUserId)
			)
		);
	if (!row || row.n === 0) throw conflict('The last active Super admin cannot be deactivated or demoted');
}
