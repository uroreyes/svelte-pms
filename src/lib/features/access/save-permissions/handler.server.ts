import { and, eq, inArray } from 'drizzle-orm';
import { rolePermission } from '$lib/server/db/schema';
import { lockPermissionMatrix } from '$lib/server/domain/permissions';
import type { CommandHandler } from '$lib/server/cqrs/execute';
import { invalid } from '$lib/server/cqrs/errors';
import { overridesFor, validateGrants } from '$lib/shared/domain/permissions';
import type { SavePermissions } from './contract';

export const savePermissions: CommandHandler<typeof SavePermissions> = async ({ grants }, { db, actor }) => {
	for (const g of grants) {
		const msg = validateGrants(g.role, g.permissions);
		if (msg) throw invalid(msg);
	}
	await lockPermissionMatrix(db, actor.propertyId);
	await db
		.delete(rolePermission)
		.where(and(eq(rolePermission.propertyId, actor.propertyId), inArray(rolePermission.role, grants.map((g) => g.role))));
	const rows = grants.flatMap((g) =>
		overridesFor(g.role, g.permissions).map((o) => ({
			propertyId: actor.propertyId,
			role: g.role,
			permission: o.permission,
			granted: o.granted
		}))
	);
	if (rows.length > 0) await db.insert(rolePermission).values(rows);
	return { roles: grants.length, overrides: rows.length };
};
