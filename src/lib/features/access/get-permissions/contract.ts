import { z } from 'zod';
import { query } from '$lib/shared/cqrs/contract';
import type { StaffRole } from '$lib/shared/domain/enums';
import type { PermissionKey } from '$lib/shared/domain/permissions';

export interface PermissionMatrixView {
	grants: Record<StaffRole, PermissionKey[]>;
	customized: Record<StaffRole, boolean>;
}

export const GetPermissions = query<PermissionMatrixView>()({
	name: 'access.permissions',
	path: '/api/access/permissions',
	permission: 'roles.manage',
	input: z.object({})
});
