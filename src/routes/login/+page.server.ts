import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { staffUser } from '$lib/server/db/schema';
import { hashPassword, verifyPassword } from '$lib/server/auth/password';
import { createSession, revokeSession, SESSION_COOKIE, SESSION_TTL_MS } from '$lib/server/auth/session';
import { rateLimit } from '$lib/server/security/rate-limit';
import { recordAuthEvent } from '$lib/server/audit/record';

// Used to equalise timing when the email is unknown.
const dummyHash = hashPassword('timing-equaliser-not-a-real-password');

export const load: PageServerLoad = ({ locals }) => {
	if (locals.actor) redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		if (!rateLimit(`login:${getClientAddress()}`, 10, 5 * 60_000)) {
			return fail(429, { email: '', message: 'Too many attempts. Try again in a few minutes.' });
		}
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase().slice(0, 254);
		const password = String(form.get('password') ?? '').slice(0, 200);
		if (!email || !password) return fail(400, { email, message: 'Email and password are required.' });

		const db = getDb();
		const [user] = await db.select().from(staffUser).where(eq(staffUser.email, email)).limit(1);
		const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
		if (!user || !ok || !user.active) {
			await recordAuthEvent(db, { command: 'auth.loginFailed', actor: null, propertyId: user?.propertyId ?? null, email });
			return fail(400, { email, message: 'Invalid email or password.' });
		}
		const { token } = await createSession(db, user.id);
		// A staff.resetPassword may have committed between verify and createSession; re-check.
		const [current] = await db
			.select({ passwordHash: staffUser.passwordHash, active: staffUser.active })
			.from(staffUser)
			.where(eq(staffUser.id, user.id))
			.limit(1);
		if (!current || !current.active || current.passwordHash !== user.passwordHash) {
			await revokeSession(db, token);
			await recordAuthEvent(db, { command: 'auth.loginFailed', actor: null, propertyId: user.propertyId, email });
			return fail(400, { email, message: 'Invalid email or password.' });
		}
		await recordAuthEvent(db, {
			command: 'auth.login',
			actor: { userId: user.id, propertyId: user.propertyId, role: user.role, name: user.name, email: user.email },
			propertyId: user.propertyId,
			email: user.email
		});

		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: Math.floor(SESSION_TTL_MS / 1000)
		});
		redirect(303, user.mustChangePassword ? '/account/password' : '/');
	}
};
