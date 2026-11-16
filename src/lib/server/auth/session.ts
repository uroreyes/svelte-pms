import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt, ne } from 'drizzle-orm';
import type { DB, Executor } from '../db/client';
import { session, staffUser } from '../db/schema';
import type { Actor } from '../cqrs/actor';

export const SESSION_COOKIE = 'pms_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(db: DB, userId: string, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
	await db.insert(session).values({ id: hashToken(token), userId, expiresAt });
	// opportunistic cleanup
	await db.delete(session).where(lt(session.expiresAt, now));
	return { token, expiresAt };
}

export async function resolveSession(db: DB, token: string | undefined, now = new Date()): Promise<Actor | null> {
	if (!token || token.length > 128) return null;
	const [row] = await db
		.select({
			userId: staffUser.id,
			propertyId: staffUser.propertyId,
			role: staffUser.role,
			name: staffUser.name,
			email: staffUser.email,
			mustChangePassword: staffUser.mustChangePassword,
			sessionId: session.id
		})
		.from(session)
		.innerJoin(staffUser, eq(staffUser.id, session.userId))
		.where(and(eq(session.id, hashToken(token)), gt(session.expiresAt, now), eq(staffUser.active, true)))
		.limit(1);
	return row ?? null;
}

export async function revokeSession(db: DB, token: string): Promise<void> {
	await db.delete(session).where(eq(session.id, hashToken(token)));
}

/** Delete all sessions of a user (optionally keeping one session row id). Returns the deleted count. */
export async function revokeUserSessions(db: Executor, userId: string, opts: { except?: string } = {}): Promise<number> {
	const where = opts.except ? and(eq(session.userId, userId), ne(session.id, opts.except)) : eq(session.userId, userId);
	const deleted = await db.delete(session).where(where).returning({ id: session.id });
	return deleted.length;
}
