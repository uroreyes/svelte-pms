/**
 * Dev seed. Goes through the same slice handlers as the HTTP API (executeCommand),
 * so seeded data obeys every invariant. Idempotent: exits if the property exists.
 *   DATABASE_URL=… npm run db:seed              (setup + demo bookings)
 *   DATABASE_URL=… npm run db:seed -- --no-demo (setup only: rooms, rates, taxes, catalog, staff)
 * Demo bookings for an existing property: scripts/seed-demo.ts.
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDb } from '$lib/server/db/client';
import { catalogItem, property, ratePlan, roomType, roomUnit, staffUser, taxRule } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/auth/password';
import { executeCommand } from '$lib/server/cqrs/execute';
import type { Actor } from '$lib/server/cqrs/actor';
import { parseKeyring } from '$lib/server/security/crypto';
import { seedDemoBookings } from '$lib/server/maintenance/seed-demo';
import { UpsertChannelMapping } from '$lib/features/channels/upsert-mapping/contract';
import { upsertChannelMapping } from '$lib/features/channels/upsert-mapping/handler.server';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const ring = parseKeyring(process.env.PII_ENCRYPTION_KEY, process.env.PII_ENCRYPTION_PREVIOUS_KEYS);
const flags = process.argv.slice(2);
const unknown = flags.filter((f) => f !== '--no-demo');
if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(' ')} (only --no-demo is supported)`);
const withDemo = !flags.includes('--no-demo');
const { db, close } = createDb(url, { max: 2 });

async function main() {
	const [existing] = await db.select().from(property).where(eq(property.slug, 'harbor-house'));
	if (existing) {
		console.log('Already seeded (property "harbor-house" exists).');
		return;
	}
	const TZ = 'Asia/Manila';
	const [p] = await db
		.insert(property)
		.values({ slug: 'harbor-house', name: 'Harbor House Boutique Hotel', address: '12 Pier Road', currency: 'USD', timezone: TZ, taxRateBp: 0, roomPostingMode: 'NIGHTLY' })
		.returning();

	const adminPassword = process.env.SEED_ADMIN_PASSWORD || randomBytes(9).toString('base64url');
	const staffPassword = process.env.SEED_STAFF_PASSWORD || adminPassword;
	const lowerEmail = (email: string) => email.toLowerCase();
	const users = await db
		.insert(staffUser)
		.values([
			{ propertyId: p!.id, email: lowerEmail('admin@harbor.test'), name: 'Avery Admin', role: 'ADMIN', passwordHash: await hashPassword(adminPassword) },
			{ propertyId: p!.id, email: lowerEmail('frontdesk@harbor.test'), name: 'Fran Desk', role: 'FRONT_DESK', passwordHash: await hashPassword(staffPassword) },
			{ propertyId: p!.id, email: lowerEmail('pos@harbor.test'), name: 'Pat Server', role: 'POS', passwordHash: await hashPassword(staffPassword) },
			// Attribution identity for the scheduled night audit; cannot sign in (is_system requires inactive).
			{ propertyId: p!.id, email: lowerEmail('night-audit@harbor.system'), name: 'Night audit (system)', role: 'MANAGER', active: false, isSystem: true, passwordHash: await hashPassword(randomBytes(32).toString('hex')) },
			{ propertyId: p!.id, email: lowerEmail('manager@harbor.test'), name: 'Morgan Manager', role: 'MANAGER', passwordHash: await hashPassword(staffPassword) },
			{ propertyId: p!.id, email: lowerEmail('revenue@harbor.test'), name: 'Riley Revenue', role: 'REVENUE_MANAGER', passwordHash: await hashPassword(staffPassword) }
		])
		.returning();
	const admin: Actor = { userId: users[0]!.id, propertyId: p!.id, role: 'ADMIN', name: users[0]!.name, email: users[0]!.email };

	const types = await db
		.insert(roomType)
		.values([
			{ propertyId: p!.id, name: 'Classic Double', baseRateCents: 9500, baseOccupancy: 2, maxOccupancy: 2, amenities: ['Queen bed', 'Rain shower'] },
			{ propertyId: p!.id, name: 'Deluxe King', baseRateCents: 14500, baseOccupancy: 2, maxOccupancy: 3, amenities: ['King bed', 'Harbor view', 'Bathtub'] },
			{ propertyId: p!.id, name: 'Family Suite', baseRateCents: 22000, baseOccupancy: 4, maxOccupancy: 5, amenities: ['2 bedrooms', 'Kitchenette'] }
		])
		.returning();
	const [dbl, dlx, ste] = types as [(typeof types)[number], (typeof types)[number], (typeof types)[number]];
	await db.insert(taxRule).values([
		{ propertyId: p!.id, name: 'VAT', kind: 'PERCENT', rateBp: 1200, appliesTo: 'ALL', sortOrder: 0 },
		{ propertyId: p!.id, name: 'Service charge', kind: 'PERCENT', rateBp: 1000, appliesTo: 'POS', sortOrder: 1 },
		{ propertyId: p!.id, name: 'Tourism levy', kind: 'PER_PERSON_NIGHT', amountCents: 150, appliesTo: 'ROOM', sortOrder: 2 }
	]);
	await db.insert(ratePlan).values(
		types.flatMap((t) => [
			{ propertyId: p!.id, roomTypeId: t.id, name: 'Flexible', code: 'FLEX', includedOccupancy: t.baseOccupancy, extraAdultCents: 2500, extraChildCents: 1000, freeCancellationDays: 2, isDefault: true },
			{ propertyId: p!.id, roomTypeId: t.id, name: 'Non-refundable', code: 'NR', adjustmentKind: 'PERCENT' as const, adjustmentValue: -1200, includedOccupancy: t.baseOccupancy, extraAdultCents: 2500, extraChildCents: 1000, refundable: false },
			{ propertyId: p!.id, roomTypeId: t.id, name: 'Bed & breakfast', code: 'BB', adjustmentKind: 'FIXED' as const, adjustmentValue: 1800, includedOccupancy: t.baseOccupancy, extraAdultCents: 2500, extraChildCents: 1000, breakfastIncluded: true, freeCancellationDays: 2 }
		])
	);
	await db
		.insert(roomUnit)
		.values([
			...['101', '102', '103', '104', '105', '106'].map((n) => ({ propertyId: p!.id, roomTypeId: dbl.id, roomNumber: n, floor: 1 })),
			...['201', '202', '203', '204'].map((n) => ({ propertyId: p!.id, roomTypeId: dlx.id, roomNumber: n, floor: 2 })),
			...['301', '302', '303'].map((n) => ({ propertyId: p!.id, roomTypeId: ste.id, roomNumber: n, floor: 3 }))
		]);

	await db
		.insert(catalogItem)
		.values([
			{ propertyId: p!.id, category: 'F&B', name: 'Breakfast buffet', unitPriceCents: 1800 },
			{ propertyId: p!.id, category: 'F&B', name: 'Club sandwich', unitPriceCents: 1400 },
			{ propertyId: p!.id, category: 'F&B', name: 'Room service – dinner', unitPriceCents: 3200 },
			{ propertyId: p!.id, category: 'MINIBAR', name: 'Minibar – water', unitPriceCents: 300 },
			{ propertyId: p!.id, category: 'MINIBAR', name: 'Minibar – craft beer', unitPriceCents: 700 },
			{ propertyId: p!.id, category: 'LAUNDRY', name: 'Laundry bag', unitPriceCents: 2200 },
			{ propertyId: p!.id, category: 'TRANSFER', name: 'Airport transfer', unitPriceCents: 4500, taxable: false },
			{ propertyId: p!.id, category: 'FEE', name: 'Late checkout', unitPriceCents: 4000 }
		]);

	const ctx = { db, actor: admin };
	await executeCommand(UpsertChannelMapping, upsertChannelMapping, { roomTypeId: dlx.id, channelName: 'BOOKING_COM', externalRoomId: 'HH-DLX-KING', active: true }, ctx);
	await executeCommand(UpsertChannelMapping, upsertChannelMapping, { roomTypeId: dbl.id, channelName: 'AIRBNB', externalRoomId: 'HH-CLASSIC', active: true }, ctx);

	if (withDemo) {
		const demo = await seedDemoBookings(db, { propertySlug: p!.slug, operatorEmail: admin.email, count: 10, ring, now: new Date() });
		console.log(`Demo data: ${demo.reservations} reservation(s), ${demo.checkedIn} checked in, ${demo.charges} folio charge(s).`);
		for (const skipped of demo.skipped) console.warn(`  skipped ${skipped}`);
	}

	console.log('Seeded Harbor House.');
	console.log(`  admin@harbor.test      / ${adminPassword}`);
	console.log(`  frontdesk@harbor.test  / ${staffPassword}`);
	console.log(`  pos@harbor.test        / ${staffPassword}`);
	console.log(`  manager@harbor.test    / ${staffPassword}`);
	console.log(`  revenue@harbor.test    / ${staffPassword}`);
	console.log('  Public booking page: /book/harbor-house');
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(close);
