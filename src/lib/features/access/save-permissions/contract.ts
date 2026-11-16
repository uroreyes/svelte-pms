import { z } from 'zod';
import { command } from '$lib/shared/cqrs/contract';
import { EDITABLE_ROLES, PERMISSION_KEYS } from '$lib/shared/domain/permissions';

export const SavePermissions = command<{ roles: number; overrides: number }>()({
	name: 'access.savePermissions',
	path: '/api/access/permissions/save',
	permission: 'roles.manage',
	input: z.object({
		grants: z
			.array(
				z.object({
					role: z.enum(EDITABLE_ROLES),
					permissions: z.array(z.enum(PERMISSION_KEYS)).max(PERMISSION_KEYS.length)
				})
			)
			.min(1)
			.max(EDITABLE_ROLES.length)
			.refine((g) => new Set(g.map((x) => x.role)).size === g.length, { message: 'Each role may appear once' })
	})
});
