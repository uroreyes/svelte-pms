/** Shared fixtures for DB integration tests: every test gets its own property (tenant isolation, no truncation). */
import { randomUUID } from 'node:crypto';
import { createDb, type DB } from './db/client';
import { property, roomType, roomUnit, staffUser } from './db/schema';
import type { Actor } from './cqrs/actor';
import type { StaffRole } from '$lib/shared/domain/enums';
import { hashPassword } from './auth/password';
import { parseKeyring } from './security/crypto';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL;
/** Fixed PII keyring for tests (key id `test`, 32 bytes of 0x07). Pass to `makeCheckIn(() => TEST_PII_KEYRING)`. */
export const TEST_PII_KEYRING = parseKeyring('test:' + Buffer.alloc(32, 7).toString('base64'));
export const NOW = new Date('2030-03-01T12:00:00Z'); // property timezone UTC → business date 2030-03-01
export const TODAY = '2030-03-01';
export const guest = { firstName: 'Ana', lastName: 'Cruz', email: 'ana@example.com' };

export function openTestDb(): { db: DB; close: () => Promise<void> } {
	if (!TEST_DB_URL) throw new Error('TEST_DATABASE_URL is not set');
	return createDb(TEST_DB_URL, { max: 12 });
}

export interface Fixture {
	slug: string;
	propertyId: string;
	admin: Actor;
	types: { id: string; name: string; units: { id: string; roomNumber: string }[] }[];
}

/** Room types: [name, baseRateCents, unitCount][]; tax 10%, UTC. */
export async function makeProperty(db: DB, types: [string, number, number][], opts: { mode?: 'UPFRONT' | 'NIGHTLY' } = {}): Promise<Fixture> {
	const slug = `t-${randomUUID().slice(0, 12)}`;
	const [p] = await db.insert(property).values({ slug, name: `Test ${slug}`, timezone: 'UTC', taxRateBp: 1000, roomPostingMode: opts.mode ?? 'NIGHTLY' }).returning();
	const [u] = await db.insert(staffUser).values({ propertyId: p!.id, email: `${slug}@t.test`, name: 'Tess Admin', role: 'ADMIN', passwordHash: 'x' }).returning();
	const out: Fixture['types'] = [];
	let n = 100;
	for (const [name, rate, count] of types) {
		const [t] = await db.insert(roomType).values({ propertyId: p!.id, name, baseRateCents: rate, baseOccupancy: 1, maxOccupancy: 3 }).returning();
		const units = count
			? await db
					.insert(roomUnit)
					.values(Array.from({ length: count }, () => ({ propertyId: p!.id, roomTypeId: t!.id, roomNumber: String(++n) })))
					.returning({ id: roomUnit.id, roomNumber: roomUnit.roomNumber })
			: [];
		out.push({ id: t!.id, name, units });
	}
	return { slug, propertyId: p!.id, types: out, admin: { userId: u!.id, propertyId: p!.id, role: 'ADMIN', name: u!.name, email: u!.email } };
}

/** Extra staff row in the fixture's property (real row, so sessions / FKs work). Returned Actor mirrors resolveSession. */
export async function addStaff(
	db: DB,
	f: Fixture,
	opts: { role: StaffRole; password?: string; active?: boolean; mustChangePassword?: boolean; isSystem?: boolean; email?: string }
): Promise<Actor> {
	const email = opts.email ?? `${opts.role.toLowerCase()}-${randomUUID().slice(0, 8)}@${f.slug}.test`;
	const passwordHash = opts.password ? await hashPassword(opts.password) : 'x';
	const [u] = await db
		.insert(staffUser)
		.values({
			propertyId: f.propertyId,
			email,
			name: `${opts.role} ${email.slice(0, 8)}`,
			role: opts.role,
			passwordHash,
			active: opts.active ?? true,
			mustChangePassword: opts.mustChangePassword ?? false,
			isSystem: opts.isSystem ?? false
		})
		.returning();
	return { userId: u!.id, propertyId: f.propertyId, role: opts.role, name: u!.name, email: u!.email, mustChangePassword: u!.mustChangePassword };
}
