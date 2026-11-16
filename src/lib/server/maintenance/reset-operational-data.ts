import { sql, type SQL } from 'drizzle-orm';
import type { DB, Executor } from '$lib/server/db/client';
import { recordAudit } from '$lib/server/audit/record';
import type { ResetArgs } from './reset-args';

export const RESET_COMMAND = 'ops.resetOperationalData';

/** Write-locked before DISABLE TRIGGER, in this order. */
export const LOCKED_TABLES = [
	'reservation',
	'reservation_night',
	'folio',
	'booking',
	'guest',
	'room_block',
	'channel_outbox',
	'invoice_counter',
	'room_inventory_daily'
] as const;

export const LEDGER_TRIGGERS = [
	['folio_item', 'folio_item_append_only'],
	['folio_item_tax', 'folio_item_tax_append_only'],
	['folio_payment', 'folio_payment_append_only'],
	['audit_event', 'audit_event_append_only']
] as const;

export interface ResetCounts {
	auditEvents: number;
	folioItemTaxes: number;
	folioItems: number;
	folioPayments: number;
	folios: number;
	reservationNights: number;
	reservations: number;
	bookings: number;
	guests: number;
	roomBlocks: number;
	channelOutbox: number;
	invoiceCounters: number;
	inventoryDaysReset: number;
}

export interface ResetPlan {
	propertyId: string;
	propertySlug: string;
	propertyName: string;
	operator: { userId: string; name: string; email: string };
	counts: ResetCounts;
	invoicesIssued: number;
	invoiceCounterLast: number;
}

export type RefusalCode = 'PROPERTY_NOT_FOUND' | 'OPERATOR_INVALID' | 'CONFIRM_MISMATCH' | 'INVOICES_ISSUED';

export class ResetRefused extends Error {
	constructor(
		readonly code: RefusalCode,
		message: string
	) {
		super(message);
		this.name = 'ResetRefused';
	}
}

interface Scope {
	key: keyof ResetCounts;
	table: string;
	where: (p: string) => SQL;
}

const folioItemScope = (p: string): SQL =>
	sql`folio_id IN (SELECT id FROM folio WHERE property_id = ${p})`;

/** Delete order (children first). `where` is the single source for count, delete and sanity recount. */
const SCOPES: readonly Scope[] = [
	{
		key: 'auditEvents',
		table: 'audit_event',
		where: (p) =>
			sql`property_id = ${p} OR reservation_id IN (SELECT id FROM reservation WHERE property_id = ${p})`
	},
	{
		key: 'folioItemTaxes',
		table: 'folio_item_tax',
		where: (p) =>
			sql`folio_item_id IN (SELECT fi.id FROM folio_item fi JOIN folio f ON f.id = fi.folio_id WHERE f.property_id = ${p})`
	},
	{ key: 'folioItems', table: 'folio_item', where: folioItemScope },
	{ key: 'folioPayments', table: 'folio_payment', where: folioItemScope },
	{ key: 'folios', table: 'folio', where: (p) => sql`property_id = ${p}` },
	{
		key: 'reservationNights',
		table: 'reservation_night',
		where: (p) => sql`reservation_id IN (SELECT id FROM reservation WHERE property_id = ${p})`
	},
	{ key: 'reservations', table: 'reservation', where: (p) => sql`property_id = ${p}` },
	{ key: 'bookings', table: 'booking', where: (p) => sql`property_id = ${p}` },
	{ key: 'guests', table: 'guest', where: (p) => sql`property_id = ${p}` },
	{ key: 'roomBlocks', table: 'room_block', where: (p) => sql`property_id = ${p}` },
	{ key: 'channelOutbox', table: 'channel_outbox', where: (p) => sql`property_id = ${p}` },
	{ key: 'invoiceCounters', table: 'invoice_counter', where: (p) => sql`property_id = ${p}` }
];

const INVENTORY_WHERE = (p: string): SQL =>
	sql`room_type_id IN (SELECT id FROM room_type WHERE property_id = ${p}) AND sold_count <> 0`;

const rowsOf = <T>(r: unknown): T[] => r as T[];

async function count(db: Executor, table: string, where: SQL): Promise<number> {
	const rows = rowsOf<{ n: number }>(
		await db.execute(sql`SELECT count(*)::int AS n FROM ${sql.raw(`"${table}"`)} WHERE ${where}`)
	);
	return rows[0]?.n ?? 0;
}

async function countAll(db: Executor, p: string): Promise<ResetCounts> {
	const entries = await Promise.all(
		SCOPES.map(async (s) => [s.key, await count(db, s.table, s.where(p))] as const)
	);
	const inventoryDaysReset = await count(db, 'room_inventory_daily', INVENTORY_WHERE(p));
	return { ...Object.fromEntries(entries), inventoryDaysReset } as unknown as ResetCounts;
}

/** First line of an error message, cut before any echoed SQL / bound params. */
const firstLine = (message: string): string =>
	(message.split('\n')[0] ?? '').split(/\s+params:|\s+Query:/)[0]!.trim();

export async function planOperationalReset(
	db: Executor,
	opts: { propertySlug: string; operatorEmail: string }
): Promise<ResetPlan> {
	const props = rowsOf<{ id: string; name: string }>(
		await db.execute(sql`SELECT id, name FROM property WHERE slug = ${opts.propertySlug}`)
	);
	const prop = props[0];
	if (!prop) throw new ResetRefused('PROPERTY_NOT_FOUND', `Property "${opts.propertySlug}" not found`);
	const ops = rowsOf<{ id: string; name: string; email: string }>(
		await db.execute(
			sql`SELECT id, name, email FROM staff_user WHERE email = ${opts.operatorEmail.toLowerCase()} AND property_id = ${prop.id} AND role = 'ADMIN' AND active AND NOT is_system AND NOT must_change_password`
		)
	);
	const op = ops[0];
	if (!op) {
		throw new ResetRefused(
			'OPERATOR_INVALID',
			`Operator ${opts.operatorEmail} is not an active ADMIN of "${opts.propertySlug}"`
		);
	}
	const counts = await countAll(db, prop.id);
	const issued = rowsOf<{ n: number }>(
		await db.execute(
			sql`SELECT count(*)::int AS n FROM folio WHERE property_id = ${prop.id} AND invoice_number IS NOT NULL`
		)
	);
	const last = rowsOf<{ n: number }>(
		await db.execute(
			sql`SELECT coalesce(max(last_number), 0)::int AS n FROM invoice_counter WHERE property_id = ${prop.id}`
		)
	);
	return {
		propertyId: prop.id,
		propertySlug: opts.propertySlug,
		propertyName: prop.name,
		operator: { userId: op.id, name: op.name, email: op.email },
		counts,
		invoicesIssued: issued[0]?.n ?? 0,
		invoiceCounterLast: last[0]?.n ?? 0
	};
}

function assertInvoicesAllowed(plan: ResetPlan, force: boolean): void {
	if ((plan.invoicesIssued > 0 || plan.invoiceCounterLast > 0) && !force) {
		throw new ResetRefused(
			'INVOICES_ISSUED',
			`Refusing: ${plan.invoicesIssued} invoice(s) issued for "${plan.propertySlug}" (invoice counter at ${plan.invoiceCounterLast}) — tax records. Re-run with --force to delete them anyway.`
		);
	}
}

export async function resetOperationalData(
	db: DB,
	opts: {
		propertySlug: string;
		operatorEmail: string;
		confirm: string;
		force: boolean;
		now: Date;
		/** Test seam: inside the tx after the deletes + sanity recount, before ENABLE TRIGGER. Throwing rolls everything back. */
		afterDelete?: (tx: Executor) => Promise<void>;
		/** Test seam: inside the tx after the audit row, before COMMIT. Throwing rolls everything back. */
		beforeCommit?: (tx: Executor) => Promise<void>;
	}
): Promise<{ plan: ResetPlan; deleted: ResetCounts; auditEventId: string }> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SET LOCAL lock_timeout = '10s'`);
		const locked = rowsOf<{ id: string }>(
			await tx.execute(sql`SELECT id FROM property WHERE slug = ${opts.propertySlug} FOR NO KEY UPDATE`)
		);
		const propertyId = locked[0]?.id;
		if (!propertyId) throw new ResetRefused('PROPERTY_NOT_FOUND', `Property "${opts.propertySlug}" not found`);
		if (opts.confirm !== opts.propertySlug) {
			throw new ResetRefused(
				'CONFIRM_MISMATCH',
				`--confirm "${opts.confirm}" does not match property slug "${opts.propertySlug}"`
			);
		}
		const pre = await planOperationalReset(tx, opts);
		assertInvoicesAllowed(pre, opts.force);

		await tx.execute(
			sql.raw(`LOCK TABLE ${LOCKED_TABLES.map((t) => `"${t}"`).join(', ')} IN SHARE ROW EXCLUSIVE MODE`)
		);
		for (const [table, name] of LEDGER_TRIGGERS) {
			await tx.execute(sql.raw(`ALTER TABLE "${table}" DISABLE TRIGGER "${name}"`));
		}

		const plan = await planOperationalReset(tx, opts);
		assertInvoicesAllowed(plan, opts.force);

		const deleted: Partial<ResetCounts> = {};
		for (const s of SCOPES) {
			const res = rowsOf<unknown>(
				await tx.execute(
					sql`DELETE FROM ${sql.raw(`"${s.table}"`)} WHERE ${s.where(propertyId)} RETURNING 1`
				)
			);
			deleted[s.key] = res.length;
		}
		const upd = rowsOf<unknown>(
			await tx.execute(
				sql`UPDATE room_inventory_daily SET sold_count = 0, updated_at = now() WHERE ${INVENTORY_WHERE(propertyId)} RETURNING 1`
			)
		);
		deleted.inventoryDaysReset = upd.length;

		const left = await countAll(tx, propertyId);
		for (const [key, n] of Object.entries(left)) {
			if (n !== 0) throw new Error(`Reset incomplete: ${key} still has ${n} rows`);
		}
		await opts.afterDelete?.(tx);

		for (const [table, name] of LEDGER_TRIGGERS) {
			await tx.execute(sql.raw(`ALTER TABLE "${table}" ENABLE TRIGGER "${name}"`));
		}
		const tables = LEDGER_TRIGGERS.map(([t]) => t);
		const names = LEDGER_TRIGGERS.map(([, n]) => n);
		const tableArr = sql.raw(`ARRAY[${tables.map((t) => `'${t}'`).join(',')}]::regclass[]`);
		const nameArr = sql.raw(`ARRAY[${names.map((n) => `'${n}'`).join(',')}]::name[]`);
		const ok = rowsOf<{ n: number }>(
			await tx.execute(
				sql`SELECT count(*)::int AS n FROM pg_trigger t WHERE t.tgrelid = ANY(${tableArr}) AND t.tgname = ANY(${nameArr}) AND t.tgenabled = 'O'`
			)
		);
		if (ok[0]?.n !== LEDGER_TRIGGERS.length) throw new Error('Append-only triggers not restored');

		const result = deleted as ResetCounts;
		await recordAudit(tx, {
			command: RESET_COMMAND,
			actor: {
				userId: plan.operator.userId,
				propertyId,
				role: 'ADMIN',
				name: plan.operator.name,
				email: plan.operator.email
			},
			input: { propertySlug: opts.propertySlug, force: opts.force },
			result,
			now: opts.now
		});
		const audit = rowsOf<{ id: string }>(
			await tx.execute(sql`SELECT id FROM audit_event WHERE property_id = ${propertyId}`)
		);
		if (audit.length !== 1 || !audit[0]) throw new Error('Expected exactly one audit row after reset');

		await opts.beforeCommit?.(tx);
		return { plan, deleted: result, auditEventId: audit[0].id };
	});
}

const COUNT_KEYS: readonly (keyof ResetCounts)[] = [
	'auditEvents',
	'folioItemTaxes',
	'folioItems',
	'folioPayments',
	'folios',
	'reservationNights',
	'reservations',
	'bookings',
	'guests',
	'roomBlocks',
	'channelOutbox',
	'invoiceCounters',
	'inventoryDaysReset'
];

export async function runOperationalReset(
	db: DB,
	args: ResetArgs,
	io: { now: Date; log: (line: string) => void; error: (line: string) => void }
): Promise<0 | 1> {
	try {
		const plan = await planOperationalReset(db, args);
		io.log(`Property: ${plan.propertyName} (${plan.propertySlug}) · operator: ${plan.operator.name}`);
		for (const k of COUNT_KEYS) io.log(`  ${k}: ${plan.counts[k]}`);
		io.log(`  invoicesIssued: ${plan.invoicesIssued} (invoice counter at ${plan.invoiceCounterLast})`);
		const others = rowsOf<{ n: number }>(
			await db.execute(
				sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid()`
			)
		);
		const n = others[0]?.n ?? 0;
		if (n > 0) {
			io.log(`WARNING: ${n} other database session(s) connected — stop the app first (docker compose stop app, or your service manager).`);
		}
		if (args.confirm === null) {
			io.log('Dry run — nothing changed. Re-run with --confirm <slug> to reset.');
			if ((plan.invoicesIssued > 0 || plan.invoiceCounterLast > 0) && !args.force) {
				io.log(`Would refuse without --force: ${plan.invoicesIssued} invoice(s) issued.`);
			}
			return 0;
		}
		const res = await resetOperationalData(db, {
			propertySlug: args.propertySlug,
			operatorEmail: args.operatorEmail,
			confirm: args.confirm,
			force: args.force,
			now: io.now
		});
		io.log('Reset complete — deleted:');
		for (const k of COUNT_KEYS) io.log(`  ${k}: ${res.deleted[k]}`);
		return 0;
	} catch (e) {
		io.error(e instanceof ResetRefused ? e.message : `Reset failed: ${firstLine(e instanceof Error ? e.message : '')}`);
		return 1;
	}
}
