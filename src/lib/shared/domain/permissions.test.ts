import { describe, expect, it } from 'vitest';
import { STAFF_ROLES } from './enums';
import {
	DEFAULT_GRANTS,
	EDITABLE_ROLES,
	PERMISSION_GROUPS,
	PERMISSION_KEYS,
	PERMISSION_REQUIRES,
	can,
	effectivePermissions,
	overridesFor,
	toggleGrant,
	validateGrants,
	type PermissionKey
} from './permissions';

describe('catalogue', () => {
	it('has 24 unique keys, each in exactly one group', () => {
		expect(PERMISSION_KEYS).toHaveLength(24);
		expect(new Set(PERMISSION_KEYS).size).toBe(24);
		const grouped = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
		expect([...grouped].sort()).toEqual([...PERMISSION_KEYS].sort());
	});
	it('requires-targets exist and have no cycles', () => {
		for (const key of PERMISSION_KEYS) {
			const seen = new Set<PermissionKey>();
			const walk = (k: PermissionKey): void => {
				for (const r of PERMISSION_REQUIRES[k] ?? []) {
					expect(PERMISSION_KEYS).toContain(r);
					expect(r).not.toBe(key);
					if (!seen.has(r)) {
						seen.add(r);
						walk(r);
					}
				}
			};
			walk(key);
		}
	});
});

describe('defaults', () => {
	it('match the default matrix', () => {
		expect(DEFAULT_GRANTS.ADMIN).toEqual(PERMISSION_KEYS);
		expect([...DEFAULT_GRANTS.MANAGER].sort()).toEqual(
			PERMISSION_KEYS.filter((k) => k !== 'roles.manage').sort()
		);
		expect([...DEFAULT_GRANTS.REVENUE_MANAGER].sort()).toEqual(
			[
				'tapeChart.view',
				'reservations.view',
				'inventory.view',
				'inventory.manage',
				'channels.view',
				'channels.manage',
				'insights.view'
			].sort()
		);
		expect([...DEFAULT_GRANTS.FRONT_DESK].sort()).toEqual(
			[
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
			].sort()
		);
		expect(DEFAULT_GRANTS.POS).toEqual(['pos.post']);
		expect(DEFAULT_GRANTS.MANAGER).toContain('staff.manage');
		expect(DEFAULT_GRANTS.FRONT_DESK).not.toContain('staff.manage');
		expect(DEFAULT_GRANTS.REVENUE_MANAGER).not.toContain('staff.manage');
		expect(DEFAULT_GRANTS.POS).not.toContain('staff.manage');
	});
	it('every editable default passes validateGrants and has no overrides', () => {
		for (const role of EDITABLE_ROLES) {
			expect(validateGrants(role, DEFAULT_GRANTS[role])).toBeNull();
			expect(overridesFor(role, DEFAULT_GRANTS[role])).toEqual([]);
		}
		expect(STAFF_ROLES.every((r) => r in DEFAULT_GRANTS)).toBe(true);
	});
});

describe('effectivePermissions', () => {
	it('ADMIN gets all keys, overrides ignored', () => {
		const p = effectivePermissions('ADMIN', [{ permission: 'setup.manage', granted: false }]);
		expect(p.size).toBe(24);
	});
	it('MANAGER lacks staff.manage once setup.manage is revoked', () => {
		const p = effectivePermissions('MANAGER', [{ permission: 'setup.manage', granted: false }]);
		expect(p.has('staff.manage')).toBe(false);
	});
	it('never grants roles.manage to non-admin', () => {
		const p = effectivePermissions('MANAGER', [{ permission: 'roles.manage', granted: true }]);
		expect(p.has('roles.manage')).toBe(false);
	});
	it('revoking reservations.view cascades', () => {
		const p = effectivePermissions('FRONT_DESK', [
			{ permission: 'reservations.view', granted: false },
			{ permission: 'audit.view', granted: true }
		]);
		for (const k of [
			'reservations.view',
			'reservations.manage',
			'frontDesk.view',
			'frontDesk.manage',
			'folio.view',
			'folio.manage',
			'audit.view'
		] as const) {
			expect(can(p, k)).toBe(false);
		}
		expect(can(p, 'pos.post')).toBe(true);
	});
	it('ignores unknown keys', () => {
		const p = effectivePermissions('POS', [{ permission: 'nope.nothing', granted: true }]);
		expect([...p]).toEqual(['pos.post']);
	});
});

describe('toggleGrant', () => {
	it('on adds requirements in catalogue order', () => {
		expect(toggleGrant([], 'audit.view', true)).toEqual(['reservations.view', 'audit.view']);
	});
	it('off removes dependants', () => {
		expect(toggleGrant(['reservations.view', 'audit.view'], 'reservations.view', false)).toEqual([]);
	});
	it('on is transitive', () => {
		expect(toggleGrant([], 'frontDesk.manage', true)).toEqual([
			'frontDesk.view',
			'frontDesk.manage',
			'reservations.view',
			'folio.view'
		].sort((a, b) => PERMISSION_KEYS.indexOf(a as PermissionKey) - PERMISSION_KEYS.indexOf(b as PermissionKey)));
	});
});

describe('frontDesk.manage requires folio.view', () => {
	it('granting adds folio.view', () => {
		expect(toggleGrant(['reservations.view', 'frontDesk.view'], 'frontDesk.manage', true)).toContain('folio.view');
	});
	it('revoking folio.view drops frontDesk.manage', () => {
		const all = toggleGrant([], 'frontDesk.manage', true);
		expect(toggleGrant(all, 'folio.view', false)).not.toContain('frontDesk.manage');
	});
	it('validateGrants rejects frontDesk.manage without folio.view', () => {
		expect(validateGrants('FRONT_DESK', ['reservations.view', 'frontDesk.view', 'frontDesk.manage'])).toMatch(
			/requires "View guest folios"/
		);
	});
});

describe('validateGrants', () => {
	it('rejects locked key', () => {
		expect(validateGrants('MANAGER', ['roles.manage'])).toBe(
			'Edit roles & permissions is reserved for the Super admin'
		);
	});
	it('rejects missing requirement', () => {
		expect(validateGrants('POS', ['audit.view'])).toMatch(
			/^POS: "Full audit log" requires "View & search reservations/
		);
	});
	it('rejects staff.manage without setup.manage', () => {
		expect(validateGrants('FRONT_DESK', [...DEFAULT_GRANTS.FRONT_DESK, 'staff.manage'])).toBe(
			'Front desk: "Manage staff users" requires "Property, rooms & rate plans, taxes, POS catalog"'
		);
	});
});
