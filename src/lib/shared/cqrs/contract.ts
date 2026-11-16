/**
 * Isomorphic CQRS contracts. A contract is the single source of truth for a slice's
 * HTTP path, input schema, result type and authorization. Client and server both import it.
 */
import type { z } from 'zod';
import type { PermissionKey } from '../domain/permissions';

export type ErrorCode =
	| 'VALIDATION'
	| 'UNAUTHENTICATED'
	| 'FORBIDDEN'
	| 'NOT_FOUND'
	| 'CONFLICT'
	| 'RATE_LIMITED'
	| 'NETWORK'
	| 'INTERNAL';

export interface ApiError {
	code: ErrorCode;
	message: string;
	details?: unknown;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

interface ContractBase<S extends z.ZodType, R> {
	readonly name: string;
	readonly path: string;
	readonly input: S;
	/** Required permission key; 'public' = no session required; 'authenticated' = any signed-in staff, not grid-controlled (reserved for self-service on one's own account) */
	readonly permission: PermissionKey | 'public' | 'authenticated';
	/** phantom carrier for the result type — never set at runtime */
	readonly __types?: (input: z.input<S>) => R;
}

export interface CommandContract<S extends z.ZodType = z.ZodType, R = unknown> extends ContractBase<S, R> {
	readonly kind: 'command';
}

export interface QueryContract<S extends z.ZodType = z.ZodType, R = unknown> extends ContractBase<S, R> {
	readonly kind: 'query';
}

export type AnyContract = CommandContract | QueryContract;

export type ResultOf<C> = C extends { __types?: (input: never) => infer R } ? R : never;
export type InputOf<C extends AnyContract> = z.input<C['input']>;
export type ParsedInputOf<C extends AnyContract> = z.output<C['input']>;

interface Definition<S extends z.ZodType> {
	name: string;
	path: string;
	input: S;
	permission: PermissionKey | 'public' | 'authenticated';
}

/** `export const PostCharge = command<{ itemId: string }>()({ name, path, input })` */
export function command<R>() {
	return <S extends z.ZodType>(def: Definition<S>): CommandContract<S, R> => ({
		kind: 'command',
		name: def.name,
		path: def.path,
		input: def.input,
		permission: def.permission
	});
}

export function query<R>() {
	return <S extends z.ZodType>(def: Definition<S>): QueryContract<S, R> => ({
		kind: 'query',
		name: def.name,
		path: def.path,
		input: def.input,
		permission: def.permission
	});
}
