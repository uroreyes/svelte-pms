/**
 * Transport-agnostic execution of slices. Used by HTTP adapters, scripts and tests,
 * so authorization + validation + transaction boundaries are identical everywhere.
 */
import type { z } from 'zod';
import type { CommandContract, ParsedInputOf, QueryContract, ResultOf } from '$lib/shared/cqrs/contract';
import type { PermissionKey } from '$lib/shared/domain/permissions';
import type { DB, Executor, Tx } from '../db/client';
import { loadPermissions } from '../domain/permissions';
import type { Actor } from './actor';
import { DomainError, forbidden, unauthenticated } from './errors';
import { recordAudit } from '../audit/record';

export interface QueryCtx {
	db: DB;
	actor: Actor;
	permissions: ReadonlySet<PermissionKey>;
	now: Date;
}
export interface CommandCtx {
	db: Tx;
	actor: Actor;
	permissions: ReadonlySet<PermissionKey>;
	now: Date;
}
/** For commands that must do network I/O outside a transaction (they open their own). */
export interface NonTxCommandCtx {
	db: DB;
	actor: Actor;
	permissions: ReadonlySet<PermissionKey>;
	now: Date;
}
export interface PublicQueryCtx {
	db: DB;
	now: Date;
}
export interface PublicCommandCtx {
	db: Tx;
	now: Date;
}

export type QueryHandler<C extends QueryContract> = (input: ParsedInputOf<C>, ctx: QueryCtx) => Promise<ResultOf<C>>;
export type CommandHandler<C extends CommandContract> = (input: ParsedInputOf<C>, ctx: CommandCtx) => Promise<ResultOf<C>>;
export type NonTxCommandHandler<C extends CommandContract> = (input: ParsedInputOf<C>, ctx: NonTxCommandCtx) => Promise<ResultOf<C>>;
export type PublicQueryHandler<C extends QueryContract> = (input: ParsedInputOf<C>, ctx: PublicQueryCtx) => Promise<ResultOf<C>>;
export type PublicCommandHandler<C extends CommandContract> = (input: ParsedInputOf<C>, ctx: PublicCommandCtx) => Promise<ResultOf<C>>;

export function parseInput<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		const fields = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
		const first = fields[0];
		throw new DomainError('VALIDATION', first ? `${first.path || 'input'}: ${first.message}` : 'Invalid input', { fields });
	}
	return parsed.data;
}

export async function authorize(
	contract: CommandContract | QueryContract,
	actor: Actor | null,
	db: Executor
): Promise<{ actor: Actor; permissions: ReadonlySet<PermissionKey> }> {
	if (contract.permission === 'public') throw new Error(`${contract.name} is public; use a public executor`);
	if (!actor) throw unauthenticated();
	if (actor.mustChangePassword && contract.permission !== 'authenticated') throw forbidden('Password change required');
	const permissions = await loadPermissions(db, actor.propertyId, actor.role);
	if (contract.permission !== 'authenticated' && !permissions.has(contract.permission)) throw forbidden();
	return { actor, permissions };
}

export async function executeQuery<C extends QueryContract>(
	contract: C,
	handler: QueryHandler<C>,
	raw: unknown,
	ctx: { db: DB; actor: Actor | null; now?: Date }
): Promise<ResultOf<C>> {
	const { actor, permissions } = await authorize(contract, ctx.actor, ctx.db);
	const input = parseInput(contract.input, raw) as ParsedInputOf<C>;
	return handler(input, { db: ctx.db, actor, permissions, now: ctx.now ?? new Date() });
}

/** One command = one transaction. */
export async function executeCommand<C extends CommandContract>(
	contract: C,
	handler: CommandHandler<C>,
	raw: unknown,
	ctx: { db: DB; actor: Actor | null; now?: Date }
): Promise<ResultOf<C>> {
	const { actor, permissions } = await authorize(contract, ctx.actor, ctx.db);
	const input = parseInput(contract.input, raw) as ParsedInputOf<C>;
	const now = ctx.now ?? new Date();
	return ctx.db.transaction(async (tx) => {
		const result = await handler(input, { db: tx, actor, permissions, now });
		await recordAudit(tx, { command: contract.name, actor, input, result, now });
		return result;
	});
}

export async function executeNonTxCommand<C extends CommandContract>(
	contract: C,
	handler: NonTxCommandHandler<C>,
	raw: unknown,
	ctx: { db: DB; actor: Actor | null; now?: Date }
): Promise<ResultOf<C>> {
	const { actor, permissions } = await authorize(contract, ctx.actor, ctx.db);
	const input = parseInput(contract.input, raw) as ParsedInputOf<C>;
	const now = ctx.now ?? new Date();
	const result = await handler(input, { db: ctx.db, actor, permissions, now });
	// No surrounding transaction (network I/O): audit after success.
	await recordAudit(ctx.db, { command: contract.name, actor, input, result, now });
	return result;
}

function assertPublic(contract: CommandContract | QueryContract): void {
	if (contract.permission !== 'public') throw new Error(`${contract.name} is not public`);
}

export async function executePublicQuery<C extends QueryContract>(contract: C, handler: PublicQueryHandler<C>, raw: unknown, ctx: { db: DB; now?: Date }): Promise<ResultOf<C>> {
	assertPublic(contract);
	return handler(parseInput(contract.input, raw) as ParsedInputOf<C>, { db: ctx.db, now: ctx.now ?? new Date() });
}

export async function executePublicCommand<C extends CommandContract>(contract: C, handler: PublicCommandHandler<C>, raw: unknown, ctx: { db: DB; now?: Date }): Promise<ResultOf<C>> {
	assertPublic(contract);
	const input = parseInput(contract.input, raw) as ParsedInputOf<C>;
	const now = ctx.now ?? new Date();
	return ctx.db.transaction(async (tx) => {
		const result = await handler(input, { db: tx, now });
		await recordAudit(tx, { command: contract.name, actor: null, input, result, now });
		return result;
	});
}
