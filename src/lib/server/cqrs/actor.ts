import type { StaffRole } from '$lib/shared/domain/enums';

export interface Actor {
	userId: string;
	propertyId: string;
	role: StaffRole;
	name: string;
	email: string;
	mustChangePassword?: boolean;
	/** session row id (sha256 of token) — never the token */
	sessionId?: string;
}
