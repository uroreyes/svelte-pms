import { loadOverrides } from '$lib/server/domain/permissions';
import type { QueryHandler } from '$lib/server/cqrs/execute';
import { STAFF_ROLES, type StaffRole } from '$lib/shared/domain/enums';
import { PERMISSION_KEYS, effectivePermissions, type PermissionKey } from '$lib/shared/domain/permissions';
import type { GetPermissions } from './contract';

export const getPermissions: QueryHandler<typeof GetPermissions> = async (_input, { db, actor }) => {
	const rows = await loadOverrides(db, actor.propertyId);
	const grants = {} as Record<StaffRole, PermissionKey[]>;
	const customized = {} as Record<StaffRole, boolean>;
	for (const role of STAFF_ROLES) {
		const mine = rows.filter((r) => r.role === role);
		const set = effectivePermissions(role, mine);
		grants[role] = PERMISSION_KEYS.filter((k) => set.has(k));
		customized[role] = mine.length > 0;
	}
	return { grants, customized };
};
