import { and, asc, desc, eq } from 'drizzle-orm';
import { staffUser } from '$lib/server/db/schema';
import { loadOverrides } from '$lib/server/domain/permissions';
import { loadProperty } from '$lib/server/domain/property';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import { STAFF_ROLES, type StaffRole } from '$lib/shared/domain/enums';
import { effectivePermissions, type PermissionKey } from '$lib/shared/domain/permissions';
import { assignableRoles, canManageRole } from '$lib/shared/domain/staff';
import type { GetStaff, StaffRow, StaffView } from './contract';

export const getStaff: QueryHandler<typeof GetStaff> = async (_input, { db, actor, permissions }) => {
	const property = await loadProperty(db, actor.propertyId);
	const overrides = await loadOverrides(db, actor.propertyId);

	const permsByRole = {} as Record<StaffRole, ReadonlySet<PermissionKey>>;
	for (const role of STAFF_ROLES) {
		permsByRole[role] = effectivePermissions(
			role,
			overrides.filter((o) => o.role === role)
		);
	}

	const rows = await db
		.select({
			id: staffUser.id,
			name: staffUser.name,
			email: staffUser.email,
			role: staffUser.role,
			active: staffUser.active,
			mustChangePassword: staffUser.mustChangePassword,
			createdAt: staffUser.createdAt
		})
		.from(staffUser)
		.where(and(eq(staffUser.propertyId, actor.propertyId), eq(staffUser.isSystem, false)))
		.orderBy(desc(staffUser.active), asc(staffUser.name));

	const users: StaffRow[] = rows.map((row) => {
		const isSelf = row.id === actor.userId;
		return {
			staffUserId: row.id,
			name: row.name,
			email: row.email,
			role: row.role,
			active: row.active,
			mustChangePassword: row.mustChangePassword,
			createdAt: row.createdAt.toISOString(),
			isSelf,
			manageable: !isSelf && canManageRole(permissions, permsByRole[row.role])
		};
	});

	return {
		timezone: property.timezone,
		users,
		assignableRoles: assignableRoles(permissions, permsByRole)
	} satisfies StaffView;
};
