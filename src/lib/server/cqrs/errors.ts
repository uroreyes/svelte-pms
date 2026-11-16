import type { ApiError, ErrorCode } from '$lib/shared/cqrs/contract';
import { PG, pgErrorCode } from '../db/pg-errors';

export class DomainError extends Error {
	constructor(
		readonly code: ErrorCode,
		message: string,
		readonly details?: unknown
	) {
		super(message);
		this.name = 'DomainError';
	}
}

export const notFound = (what: string) => new DomainError('NOT_FOUND', `${what} not found`);
export const conflict = (message: string, details?: unknown) => new DomainError('CONFLICT', message, details);
export const invalid = (message: string, details?: unknown) => new DomainError('VALIDATION', message, details);
export const forbidden = (message = 'You do not have permission to perform this action') => new DomainError('FORBIDDEN', message);
export const unauthenticated = () => new DomainError('UNAUTHENTICATED', 'Sign in required');

const HTTP_STATUS: Record<ErrorCode, number> = {
	VALIDATION: 422,
	UNAUTHENTICATED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	RATE_LIMITED: 429,
	NETWORK: 502,
	INTERNAL: 500
};

/** Maps any thrown value to a safe API error. Unknown errors are logged, never leaked. */
export function toApiError(e: unknown, context: string): { status: number; error: ApiError } {
	if (e instanceof DomainError) {
		return { status: HTTP_STATUS[e.code], error: { code: e.code, message: e.message, details: e.details } };
	}
	switch (pgErrorCode(e)) {
		case PG.EXCLUSION_VIOLATION:
			return { status: 409, error: { code: 'CONFLICT', message: 'That room is already allocated for overlapping dates' } };
		case PG.UNIQUE_VIOLATION:
			return { status: 409, error: { code: 'CONFLICT', message: 'A record with the same unique value already exists' } };
		case PG.RAISE_EXCEPTION:
			return { status: 409, error: { code: 'CONFLICT', message: 'Posted ledger entries are immutable' } };
		case PG.CHECK_VIOLATION:
			return { status: 422, error: { code: 'VALIDATION', message: 'A data constraint was violated' } };
	}
	console.error(`[${context}] unhandled error`, e);
	return { status: 500, error: { code: 'INTERNAL', message: 'Unexpected server error' } };
}
