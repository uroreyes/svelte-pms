/**
 * Writes one audit_event per successful command (PR-23). Called by the executors inside the
 * command's transaction (rolled back together). Generic: entity + reservation are derived from
 * well-known id fields, so new slices are audited without extra code.
 */
import { eq } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { auditEvent, booking, folio, folioItem, folioPayment, reservation } from '../db/schema';
import type { Actor } from '../cqrs/actor';

/** Guest / payer personal data never enters the audit trail. */
const PII_KEYS = new Set([
	'firstName',
	'lastName',
	'email',
	'phone',
	'idDocumentNumber',
	'payerName',
	'taxId',
	'billingAddress',
	'notes',
	'password',
	'temporaryPassword',
	'currentPassword',
	'newPassword'
]);
const REDACTED = '[redacted]';

export function redact(value: unknown, depth = 0): unknown {
	if (depth > 6) return REDACTED;
	if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
	if (value && typeof value === 'object' && !(value instanceof Date)) {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([k, v]) => {
				if (PII_KEYS.has(k) && v !== undefined && v !== null && v !== '') return [k, REDACTED];
				// Payment references can be card auth codes → keep only the last 4 characters.
				if (k === 'referenceNo' && typeof v === 'string' && v.length > 4) return [k, `…${v.slice(-4)}`];
				return [k, redact(v, depth + 1)];
			})
		);
	}
	if (typeof value === 'string' && value.length > 500) return value.slice(0, 500) + '…';
	return value;
}

/** Most specific first: what the command acted on. */
const ENTITY_KEYS = ['reservationId', 'folioId', 'itemId', 'paymentId', 'blockId', 'roomUnitId', 'mappingId', 'ratePlanId', 'roomTypeId', 'taxRuleId', 'catalogItemId', 'staffUserId'] as const;

type Bag = Record<string, unknown>;
const asBag = (v: unknown): Bag => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Bag) : {});
const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

export function deriveEntity(input: Bag, result: Bag): { entityType: string | null; entityId: string | null } {
	for (const source of [input, result]) {
		for (const key of ENTITY_KEYS) {
			const id = str(source[key]);
			if (id) return { entityType: key.slice(0, -2), entityId: id };
		}
	}
	const id = str(input.id);
	return id ? { entityType: 'record', entityId: id } : { entityType: null, entityId: null };
}

async function resolveReservation(db: Executor, input: Bag, result: Bag): Promise<{ reservationId: string | null; propertyId: string | null }> {
	const direct = str(input.reservationId) ?? str(result.reservationId);
	const byFolio = async (folioId: string) => (await db.select({ r: folio.reservationId, p: folio.propertyId }).from(folio).where(eq(folio.id, folioId)))[0];
	let hit: { r: string; p: string } | undefined;
	if (direct) {
		const [row] = await db.select({ r: reservation.id, p: reservation.propertyId }).from(reservation).where(eq(reservation.id, direct));
		hit = row;
	} else if (str(input.folioId)) {
		hit = await byFolio(str(input.folioId)!);
	} else if (str(input.itemId)) {
		const [row] = await db.select({ f: folioItem.folioId }).from(folioItem).where(eq(folioItem.id, str(input.itemId)!));
		if (row) hit = await byFolio(row.f);
	} else if (str(input.paymentId)) {
		const [row] = await db.select({ f: folioPayment.folioId }).from(folioPayment).where(eq(folioPayment.id, str(input.paymentId)!));
		if (row) hit = await byFolio(row.f);
	}
	if (hit) return { reservationId: hit.r, propertyId: hit.p };
	// Public multi-room booking: resolve the property from the booking code.
	const code = str(result.confirmationCode);
	if (code) {
		const [b] = await db.select({ p: booking.propertyId }).from(booking).where(eq(booking.confirmationCode, code));
		if (b) return { reservationId: null, propertyId: b.p };
	}
	return { reservationId: null, propertyId: null };
}

/** Housekeeping commands that ran but changed nothing are not worth an audit row. */
function isNoop(command: string, result: Bag): boolean {
	return command === 'channels.processOutbox' && [result.sent, result.failed, result.dryRun].every((n) => n === 0);
}

function publicActorLabel(command: string, input: Bag): string {
	if (command.startsWith('bookingEngine.')) return 'Public booking engine';
	if (command === 'channels.ingestReservation') return `Channel: ${str(input.channel) ?? 'unknown'}`;
	return 'Public';
}

export async function recordAudit(db: Executor, e: { command: string; actor: Actor | null; input: unknown; result: unknown; now: Date }): Promise<void> {
	const input = asBag(e.input);
	const result = asBag(e.result);
	if (isNoop(e.command, result)) return;
	const { reservationId, propertyId } = await resolveReservation(db, input, result);
	const { entityType, entityId } = deriveEntity(input, result);
	await db.insert(auditEvent).values({
		propertyId: e.actor?.propertyId ?? propertyId,
		actorUserId: e.actor?.userId ?? null,
		actorLabel: e.actor?.name ?? publicActorLabel(e.command, input),
		command: e.command,
		entityType,
		entityId,
		reservationId,
		input: redact(e.input ?? {}) as object,
		result: e.result === undefined ? null : (redact(e.result) as object),
		occurredAt: e.now
	});
}

/** Auth events written outside the command executor (login form actions). */
export async function recordAuthEvent(db: Executor, e: { command: 'auth.login' | 'auth.loginFailed' | 'auth.logout'; actor: Actor | null; propertyId: string | null; email: string; now?: Date }): Promise<void> {
	await db.insert(auditEvent).values({
		propertyId: e.actor?.propertyId ?? e.propertyId,
		actorUserId: e.actor?.userId ?? null,
		actorLabel: e.actor?.name ?? 'Unknown',
		command: e.command,
		entityType: 'staffUser',
		entityId: e.actor?.userId ?? null,
		input: { email: e.email.slice(0, 254) },
		occurredAt: e.now ?? new Date()
	});
}
