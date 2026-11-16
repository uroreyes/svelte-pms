/** Pure staff-management rules (isomorphic). No I/O. */
import { ROLE_ORDER, type StaffRole } from './enums';
import type { PermissionKey } from './permissions';

/** Minimum length for any staff password (PR-03). */
export const PASSWORD_MIN_LENGTH = 12;
/** Upper bound; matches the login truncation (`login/+page.server.ts`). */
export const PASSWORD_MAX_LENGTH = 200;

/** Generated temporary passwords are always this long. */
export const TEMP_PASSWORD_LENGTH = 16;

/** Unambiguous alphabet: no I, L, O, 0, 1. */
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
/** Bytes at or above this value are rejected to avoid modulo bias: largest multiple of the alphabet length ≤ 256. */
const TEMP_PASSWORD_REJECT_FROM =
	Math.floor(256 / TEMP_PASSWORD_ALPHABET.length) * TEMP_PASSWORD_ALPHABET.length;

/**
 * An actor may manage a role only when every permission of that role is held by the actor.
 * Compares permission sets, never role literals.
 */
export function canManageRole(
	actorPerms: Iterable<PermissionKey>,
	rolePerms: Iterable<PermissionKey>
): boolean {
	const actor = new Set(actorPerms);
	for (const key of rolePerms) {
		if (!actor.has(key)) return false;
	}
	return true;
}

/** Roles the actor may assign, in grid column order. */
export function assignableRoles(
	actorPerms: Iterable<PermissionKey>,
	permsByRole: Readonly<Record<StaffRole, Iterable<PermissionKey>>>
): StaffRole[] {
	const actor = new Set(actorPerms);
	return ROLE_ORDER.filter((role) => canManageRole(actor, permsByRole[role]));
}

/**
 * Builds a temporary password from caller-supplied random bytes (rejection sampling).
 * Callers pass `crypto.getRandomValues(new Uint8Array(64))`.
 */
export function tempPasswordFromBytes(bytes: Uint8Array): string {
	const out: string[] = [];
	for (const byte of bytes) {
		if (out.length === TEMP_PASSWORD_LENGTH) break;
		if (byte >= TEMP_PASSWORD_REJECT_FROM) continue;
		out.push(TEMP_PASSWORD_ALPHABET.charAt(byte % TEMP_PASSWORD_ALPHABET.length));
	}
	if (out.length < TEMP_PASSWORD_LENGTH) throw new Error('not enough entropy');
	return out.join('');
}
