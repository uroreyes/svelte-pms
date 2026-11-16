import { can, type PermissionKey } from '$lib/shared/domain/permissions';

export interface NavItem {
	href: string;
	label: string;
	anyOf: readonly PermissionKey[];
}

export const NAV: readonly NavItem[] = [
	{ href: '/', label: 'Front desk', anyOf: ['frontDesk.view'] },
	{ href: '/tape-chart', label: 'Tape chart', anyOf: ['tapeChart.view'] },
	{ href: '/reservations', label: 'Reservations', anyOf: ['reservations.view'] },
	{ href: '/pos', label: 'Add order', anyOf: ['pos.post'] },
	{ href: '/housekeeping', label: 'Housekeeping', anyOf: ['housekeeping.view'] },
	{ href: '/inventory', label: 'Rates & inventory', anyOf: ['inventory.view'] },
	{ href: '/reports', label: 'Reports', anyOf: ['reports.view', 'audit.view'] },
	{ href: '/channels', label: 'Channels', anyOf: ['channels.view'] },
	{ href: '/insights', label: 'Insights', anyOf: ['insights.view'] },
	{ href: '/setup', label: 'Setup', anyOf: ['setup.manage'] }
];

export function visibleNav(perms: readonly PermissionKey[]): typeof NAV {
	return NAV.filter((n) => n.anyOf.some((k) => can(perms, k)));
}

export function homePath(perms: readonly PermissionKey[]): string | null {
	return visibleNav(perms)[0]?.href ?? null;
}
