import { describe, expect, it } from 'vitest';
import { staffEmail, staffName, staffPassword } from '../cqrs/schemas';
import { ROLE_ORDER, type StaffRole } from './enums';
import {
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	TEMP_PASSWORD_LENGTH,
	assignableRoles,
	canManageRole,
	tempPasswordFromBytes
} from './staff';
import { DEFAULT_GRANTS, PERMISSION_KEYS, type PermissionKey } from './permissions';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function pwError(value: string): string | undefined {
	const res = staffPassword.safeParse(value);
	return res.success ? undefined : res.error.issues[0]?.message;
}

describe('canManageRole', () => {
	const [k0, k1, k2] = PERMISSION_KEYS;

	it('is true when every role permission is held by the actor', () => {
		expect(canManageRole([k0, k1], [k0])).toBe(true);
	});

	it('is false when any role permission is missing', () => {
		expect(canManageRole([k0], [k0, k1])).toBe(false);
	});

	it('is true for an empty role set', () => {
		expect(canManageRole([], [])).toBe(true);
		expect(canManageRole([k0], [])).toBe(true);
	});

	it('does not allow an admin-level role to a manager', () => {
		expect(canManageRole(DEFAULT_GRANTS.MANAGER, PERMISSION_KEYS)).toBe(false);
	});

	it('allows an admin-level role to a super admin (all keys)', () => {
		expect(canManageRole(PERMISSION_KEYS, PERMISSION_KEYS)).toBe(true);
	});

	it('reads a one-shot iterable exactly once', () => {
		function* once(): Generator<PermissionKey> {
			yield k0;
			yield k2;
		}
		expect(canManageRole(once(), [k0, k2])).toBe(true);
		expect(canManageRole(once(), [k0, k1])).toBe(false);
	});
});

describe('assignableRoles', () => {
	it('lets a manager assign peers and below, never Super admin', () => {
		expect(assignableRoles(DEFAULT_GRANTS.MANAGER, DEFAULT_GRANTS)).toEqual([
			'MANAGER',
			'REVENUE_MANAGER',
			'FRONT_DESK',
			'POS'
		]);
	});

	it('lets a full-permission actor assign every role in grid order', () => {
		expect(assignableRoles(PERMISSION_KEYS, DEFAULT_GRANTS)).toEqual(ROLE_ORDER);
	});

	it('with no permissions, only roles without grants are assignable', () => {
		const roles = assignableRoles([], DEFAULT_GRANTS);
		expect(roles).not.toContain('ADMIN');
		expect(roles).toEqual(
			ROLE_ORDER.filter((r: StaffRole) => DEFAULT_GRANTS[r].length === 0)
		);
	});
});

describe('tempPasswordFromBytes', () => {
	const bytes = (fill: number[]): Uint8Array => {
		const out = new Uint8Array(64);
		fill.forEach((v, i) => (out[i] = v));
		return out;
	};

	it('is deterministic for fixed bytes', () => {
		const input = bytes(Array.from({ length: 64 }, (_, i) => i));
		expect(tempPasswordFromBytes(input)).toBe(tempPasswordFromBytes(input));
	});

	it('produces exactly TEMP_PASSWORD_LENGTH characters from the alphabet', () => {
		const pw = tempPasswordFromBytes(bytes(Array.from({ length: 64 }, (_, i) => i * 3)));
		expect(pw).toHaveLength(TEMP_PASSWORD_LENGTH);
		for (const ch of pw) expect(ALPHABET).toContain(ch);
	});

	it('maps each accepted byte to alphabet[byte % length]', () => {
		const pw = tempPasswordFromBytes(bytes(Array.from({ length: 16 }, () => 0)));
		expect(pw).toBe(ALPHABET[0]!.repeat(TEMP_PASSWORD_LENGTH));
	});

	it('skips bytes at or above 216 (largest multiple of the alphabet length ≤ 256)', () => {
		const skipped = bytes([216, 219, 255, 217, ...Array.from({ length: 16 }, () => 1)]);
		expect(tempPasswordFromBytes(skipped)).toBe(ALPHABET[1]!.repeat(TEMP_PASSWORD_LENGTH));
	});

	it('accepts byte 215 as alphabet[215 % length]', () => {
		const pw = tempPasswordFromBytes(bytes([216, 217, 218, 219, ...Array.from({ length: 16 }, () => 215)]));
		expect(pw).toBe(ALPHABET[215 % ALPHABET.length]!.repeat(TEMP_PASSWORD_LENGTH));
	});

	it('throws when the bytes run out before the password is full', () => {
		expect(() => tempPasswordFromBytes(new Uint8Array([1, 2, 3]))).toThrow('not enough entropy');
	});

	it('produces output that passes staffPassword', () => {
		const pw = tempPasswordFromBytes(bytes(Array.from({ length: 64 }, (_, i) => (i * 37) % 256)));
		expect(staffPassword.safeParse(pw).success).toBe(true);
	});
});

describe('staffPassword', () => {
	it('rejects passwords shorter than the minimum', () => {
		expect(PASSWORD_MIN_LENGTH).toBe(12);
		expect(pwError('abcdefghijk')).toBe('Password must be at least 12 characters');
	});

	it('accepts 12 varied characters', () => {
		expect(pwError('Abcdef123456')).toBeUndefined();
	});

	it('rejects passwords longer than the maximum', () => {
		expect(staffPassword.safeParse('a'.repeat(PASSWORD_MAX_LENGTH)).success).toBe(false);
		expect(staffPassword.safeParse('ab'.repeat(PASSWORD_MAX_LENGTH / 2 + 1)).success).toBe(false);
	});

	it('rejects a single repeated character', () => {
		expect(pwError('aaaaaaaaaaaa')).toBe('Choose a less repetitive password');
	});

	it('rejects only three distinct characters', () => {
		expect(pwError('abababababab')).toBe('Choose a less repetitive password');
		expect(pwError('abcabcabcabc')).toBe('Choose a less repetitive password');
	});

	it('accepts exactly four distinct characters', () => {
		expect(pwError('abcdabcdabcd')).toBeUndefined();
	});

	it('rejects padding that trims below the minimum', () => {
		expect(pwError('   abcdefgh  ')).toBe('Choose a less repetitive password');
	});
});

describe('staffEmail', () => {
	it('trims and lower-cases', () => {
		expect(staffEmail.parse(' A@B.Test ')).toBe('a@b.test');
	});

	it('rejects an invalid address', () => {
		expect(staffEmail.safeParse('not-an-email').success).toBe(false);
	});
});

describe('staffName', () => {
	it('trims and rejects empty or over-long names', () => {
		expect(staffName.parse('  Ana  ')).toBe('Ana');
		expect(staffName.safeParse('   ').success).toBe(false);
		expect(staffName.safeParse('x'.repeat(81)).success).toBe(false);
	});
});
