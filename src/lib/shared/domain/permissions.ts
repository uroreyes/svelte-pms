import { STAFF_ROLE_LABEL, type StaffRole } from './enums';

export const PERMISSION_KEYS = [
	'frontDesk.view',
	'frontDesk.manage',
	'tapeChart.view',
	'tapeChart.manage',
	'reservations.view',
	'reservations.manage',
	'folio.view',
	'folio.manage',
	'folio.voidPayment',
	'folio.nightAudit',
	'pos.post',
	'housekeeping.view',
	'housekeeping.manage',
	'inventory.view',
	'inventory.manage',
	'channels.view',
	'channels.manage',
	'reports.view',
	'reports.export',
	'insights.view',
	'audit.view',
	'setup.manage',
	'staff.manage',
	'roles.manage'
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_GROUPS: readonly {
	feature: string;
	label: string;
	permissions: readonly { key: PermissionKey; label: string }[];
}[] = [
	{
		feature: 'frontDesk',
		label: 'Front desk',
		permissions: [
			{ key: 'frontDesk.view', label: 'View arrivals, departures & in-house' },
			{ key: 'frontDesk.manage', label: 'Check in / check out' }
		]
	},
	{
		feature: 'tapeChart',
		label: 'Tape chart',
		permissions: [
			{ key: 'tapeChart.view', label: 'View tape chart' },
			{ key: 'tapeChart.manage', label: 'Close / reopen rooms (maintenance blocks)' }
		]
	},
	{
		feature: 'reservations',
		label: 'Reservations',
		permissions: [
			{ key: 'reservations.view', label: 'View & search reservations (incl. history)' },
			{
				key: 'reservations.manage',
				label: 'Create, modify, cancel, no-show, assign & move rooms'
			}
		]
	},
	{
		feature: 'folio',
		label: 'Folio & payments',
		permissions: [
			{ key: 'folio.view', label: 'View guest folios' },
			{
				key: 'folio.manage',
				label:
					'Payments, refunds, void/transfer charges, split & billing, post room nights, discounts'
			},
			{ key: 'folio.voidPayment', label: 'Void payments' },
			{ key: 'folio.nightAudit', label: 'Run night audit' }
		]
	},
	{
		feature: 'pos',
		label: 'POS',
		permissions: [{ key: 'pos.post', label: 'Add orders to rooms' }]
	},
	{
		feature: 'housekeeping',
		label: 'Housekeeping',
		permissions: [
			{ key: 'housekeeping.view', label: 'View room board' },
			{ key: 'housekeeping.manage', label: 'Change room status' }
		]
	},
	{
		feature: 'inventory',
		label: 'Rates & inventory',
		permissions: [
			{ key: 'inventory.view', label: 'View rates & inventory grid' },
			{
				key: 'inventory.manage',
				label: 'Edit inventory, prices, restrictions, rate-plan overrides'
			}
		]
	},
	{
		feature: 'channels',
		label: 'Channels',
		permissions: [
			{ key: 'channels.view', label: 'View channel status & mappings' },
			{ key: 'channels.manage', label: 'Edit mappings, iCal sync, push ARI' }
		]
	},
	{
		feature: 'reports',
		label: 'Reports',
		permissions: [
			{ key: 'reports.view', label: 'Cashier report' },
			{ key: 'reports.export', label: 'CSV exports' }
		]
	},
	{
		feature: 'insights',
		label: 'Insights',
		permissions: [{ key: 'insights.view', label: 'Insights dashboard' }]
	},
	{
		feature: 'audit',
		label: 'Audit log',
		permissions: [{ key: 'audit.view', label: 'Full audit log' }]
	},
	{
		feature: 'setup',
		label: 'Setup',
		permissions: [
			{ key: 'setup.manage', label: 'Property, rooms & rate plans, taxes, POS catalog' }
		]
	},
	{
		feature: 'staff',
		label: 'Staff',
		permissions: [{ key: 'staff.manage', label: 'Manage staff users' }]
	},
	{
		feature: 'roles',
		label: 'Roles & permissions',
		permissions: [{ key: 'roles.manage', label: 'Edit roles & permissions' }]
	}
];

export const PERMISSION_LABEL: Readonly<Record<PermissionKey, string>> = Object.fromEntries(
	PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, p.label]))
) as Record<PermissionKey, string>;

export const PERMISSION_REQUIRES: Readonly<Partial<Record<PermissionKey, readonly PermissionKey[]>>> =
	{
		'frontDesk.view': ['reservations.view'],
		'frontDesk.manage': ['frontDesk.view', 'folio.view'],
		'tapeChart.manage': ['tapeChart.view'],
		'reservations.manage': ['reservations.view'],
		'folio.view': ['reservations.view'],
		'folio.manage': ['folio.view'],
		'folio.voidPayment': ['folio.view'],
		'folio.nightAudit': ['frontDesk.view'],
		'housekeeping.manage': ['housekeeping.view'],
		'inventory.manage': ['inventory.view'],
		'channels.manage': ['channels.view'],
		'reports.export': ['reports.view'],
		'audit.view': ['reservations.view'],
		'staff.manage': ['setup.manage']
	};

export const LOCKED_TO_ADMIN: readonly PermissionKey[] = ['roles.manage'];

export const EDITABLE_ROLES = ['MANAGER', 'REVENUE_MANAGER', 'FRONT_DESK', 'POS'] as const satisfies readonly StaffRole[];
export type EditableRole = (typeof EDITABLE_ROLES)[number];

const MANAGER_GRANTS: readonly PermissionKey[] = PERMISSION_KEYS.filter(
	(k) => !LOCKED_TO_ADMIN.includes(k)
);

export const DEFAULT_GRANTS: Readonly<Record<StaffRole, readonly PermissionKey[]>> = {
	ADMIN: PERMISSION_KEYS,
	MANAGER: MANAGER_GRANTS,
	REVENUE_MANAGER: [
		'tapeChart.view',
		'reservations.view',
		'inventory.view',
		'inventory.manage',
		'channels.view',
		'channels.manage',
		'insights.view'
	],
	FRONT_DESK: [
		'frontDesk.view',
		'frontDesk.manage',
		'tapeChart.view',
		'tapeChart.manage',
		'reservations.view',
		'reservations.manage',
		'folio.view',
		'folio.manage',
		'pos.post',
		'housekeeping.view',
		'housekeeping.manage',
		'reports.view'
	],
	POS: ['pos.post']
};

const isKey = (k: string): k is PermissionKey => (PERMISSION_KEYS as readonly string[]).includes(k);

/** Drops every key whose requirement is missing, repeating until stable (transitive, fail-closed). */
function dropUnmet(set: Set<PermissionKey>): Set<PermissionKey> {
	let changed = true;
	while (changed) {
		changed = false;
		for (const key of [...set]) {
			if ((PERMISSION_REQUIRES[key] ?? []).some((r) => !set.has(r))) {
				set.delete(key);
				changed = true;
			}
		}
	}
	return set;
}

export function effectivePermissions(
	role: StaffRole,
	overrides: readonly { permission: string; granted: boolean }[]
): ReadonlySet<PermissionKey> {
	if (role === 'ADMIN') return new Set(PERMISSION_KEYS);
	const set = new Set<PermissionKey>(DEFAULT_GRANTS[role]);
	for (const o of overrides) {
		if (!isKey(o.permission) || LOCKED_TO_ADMIN.includes(o.permission)) continue;
		if (o.granted) set.add(o.permission);
		else set.delete(o.permission);
	}
	return dropUnmet(set);
}

export function overridesFor(
	role: EditableRole,
	granted: readonly PermissionKey[]
): { permission: PermissionKey; granted: boolean }[] {
	const want = new Set(granted);
	const defaults = new Set(DEFAULT_GRANTS[role]);
	return PERMISSION_KEYS.flatMap((permission) =>
		want.has(permission) === defaults.has(permission)
			? []
			: [{ permission, granted: want.has(permission) }]
	);
}

export function validateGrants(
	role: EditableRole,
	granted: readonly PermissionKey[]
): string | null {
	const set = new Set(granted);
	for (const key of PERMISSION_KEYS) {
		if (!set.has(key)) continue;
		if (LOCKED_TO_ADMIN.includes(key)) {
			return `${PERMISSION_LABEL[key]} is reserved for the Super admin`;
		}
		for (const req of PERMISSION_REQUIRES[key] ?? []) {
			if (!set.has(req)) {
				return `${STAFF_ROLE_LABEL[role]}: "${PERMISSION_LABEL[key]}" requires "${PERMISSION_LABEL[req]}"`;
			}
		}
	}
	return null;
}

export function toggleGrant(
	granted: readonly PermissionKey[],
	key: PermissionKey,
	on: boolean
): PermissionKey[] {
	const set = new Set<PermissionKey>(granted);
	if (on) {
		const add = (k: PermissionKey): void => {
			set.add(k);
			(PERMISSION_REQUIRES[k] ?? []).forEach(add);
		};
		add(key);
	} else {
		set.delete(key);
		dropUnmet(set);
	}
	return PERMISSION_KEYS.filter((k) => set.has(k));
}

export function can(perms: Iterable<PermissionKey>, key: PermissionKey): boolean {
	for (const p of perms) if (p === key) return true;
	return false;
}
