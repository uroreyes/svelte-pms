import { and, eq } from 'drizzle-orm';
import { effectivePermissions, type PermissionKey } from '$lib/shared/domain/permissions';
import type { StaffRole } from '$lib/shared/domain/enums';
import type { Executor, Tx } from '../db/client';
import { property, rolePermission } from '../db/schema';
import { notFound } from '../cqrs/errors';

/** Effective permissions of a role at a property. ADMIN is fixed: no query. */
export async function loadPermissions(db: Executor, propertyId: string, role: StaffRole): Promise<ReadonlySet<PermissionKey>> {
	if (role === 'ADMIN') return effectivePermissions('ADMIN', []);
	const rows = await db
		.select({ permission: rolePermission.permission, granted: rolePermission.granted })
		.from(rolePermission)
		.where(and(eq(rolePermission.propertyId, propertyId), eq(rolePermission.role, role)));
	return effectivePermissions(role, rows);
}

export async function loadOverrides(db: Executor, propertyId: string): Promise<{ role: StaffRole; permission: string; granted: boolean }[]> {
	return db
		.select({ role: rolePermission.role, permission: rolePermission.permission, granted: rolePermission.granted })
		.from(rolePermission)
		.where(eq(rolePermission.propertyId, propertyId));
}

/** Serialises permission-matrix edits per property. Locks only the property row. */
export async function lockPermissionMatrix(db: Tx, propertyId: string): Promise<void> {
	const [row] = await db.select({ id: property.id }).from(property).where(eq(property.id, propertyId)).for('no key update');
	if (!row) throw notFound('Property');
}
