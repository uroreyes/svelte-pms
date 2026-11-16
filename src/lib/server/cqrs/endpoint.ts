/**
 * HTTP adapters: the only glue between SvelteKit routes and slice handlers.
 *   GET  → query  (input from query string)
 *   POST → command (input from JSON body)
 */
import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import type { ApiResult, CommandContract, QueryContract } from '$lib/shared/cqrs/contract';
import { getDb } from '../db';
import { DomainError, toApiError } from './errors';
import {
	executeCommand,
	executeNonTxCommand,
	executePublicCommand,
	executePublicQuery,
	executeQuery,
	type CommandHandler,
	type NonTxCommandHandler,
	type PublicCommandHandler,
	type PublicQueryHandler,
	type QueryHandler
} from './execute';
import { rateLimit } from '../security/rate-limit';

const MAX_BODY_BYTES = 256 * 1024;

export function searchParamsToObject(params: URLSearchParams): Record<string, string | string[]> {
	const out: Record<string, string | string[]> = {};
	for (const key of new Set(params.keys())) {
		const all = params.getAll(key);
		out[key] = all.length > 1 ? all : (all[0] ?? '');
	}
	return out;
}

export async function readJsonBody(request: Request): Promise<unknown> {
	if (!request.headers.get('content-type')?.includes('application/json')) {
		throw new DomainError('VALIDATION', 'Expected application/json body');
	}
	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) throw new DomainError('VALIDATION', 'Request body too large');
	try {
		return text ? JSON.parse(text) : {};
	} catch {
		throw new DomainError('VALIDATION', 'Malformed JSON body');
	}
}

async function respond<T>(name: string, run: () => Promise<T>, okStatus = 200): Promise<Response> {
	try {
		const data = await run();
		return json({ ok: true, data } satisfies ApiResult<T>, { status: okStatus, headers: { 'cache-control': 'no-store' } });
	} catch (e) {
		const { status, error } = toApiError(e, name);
		return json({ ok: false, error } satisfies ApiResult<T>, { status, headers: { 'cache-control': 'no-store' } });
	}
}

function guardRate(event: RequestEvent, bucket: string, limit: number, windowMs: number): void {
	if (!rateLimit(`${bucket}:${event.getClientAddress()}`, limit, windowMs)) {
		throw new DomainError('RATE_LIMITED', 'Too many requests — try again shortly');
	}
}

export function staffQuery<C extends QueryContract>(contract: C, handler: QueryHandler<C>): RequestHandler {
	return (event) =>
		respond(contract.name, () =>
			executeQuery(contract, handler, searchParamsToObject(event.url.searchParams), { db: getDb(), actor: event.locals.actor })
		);
}

export function staffCommand<C extends CommandContract>(contract: C, handler: CommandHandler<C>): RequestHandler {
	return (event) =>
		respond(contract.name, async () => executeCommand(contract, handler, await readJsonBody(event.request), { db: getDb(), actor: event.locals.actor }));
}

export function staffCommandNoTx<C extends CommandContract>(contract: C, handler: NonTxCommandHandler<C>): RequestHandler {
	return (event) =>
		respond(contract.name, async () =>
			executeNonTxCommand(contract, handler, await readJsonBody(event.request), { db: getDb(), actor: event.locals.actor })
		);
}

interface PublicOptions {
	rate: { limit: number; windowMs: number };
}

export function publicQuery<C extends QueryContract>(contract: C, handler: PublicQueryHandler<C>, opts: PublicOptions): RequestHandler {
	return (event) =>
		respond(contract.name, () => {
			guardRate(event, contract.name, opts.rate.limit, opts.rate.windowMs);
			return executePublicQuery(contract, handler, searchParamsToObject(event.url.searchParams), { db: getDb() });
		});
}

export function publicCommand<C extends CommandContract>(contract: C, handler: PublicCommandHandler<C>, opts: PublicOptions): RequestHandler {
	return (event) =>
		respond(
			contract.name,
			async () => {
				guardRate(event, contract.name, opts.rate.limit, opts.rate.windowMs);
				return executePublicCommand(contract, handler, await readJsonBody(event.request), { db: getDb() });
			},
			201
		);
}

export { respond };
