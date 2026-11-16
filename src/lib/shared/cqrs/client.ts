/**
 * Client-side CQRS bus. Commands → POST JSON, Queries → GET query string.
 * Works in browser and in SvelteKit `load` (pass the `fetch` provided by Kit).
 */
import { error } from '@sveltejs/kit';
import type { ApiResult, CommandContract, InputOf, QueryContract, ResultOf } from './contract';

type Fetch = typeof fetch;

const STATUS: Record<string, number> = {
	VALIDATION: 422,
	UNAUTHENTICATED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	RATE_LIMITED: 429
};

function isApiResult(body: unknown): body is ApiResult<unknown> {
	return typeof body === 'object' && body !== null && 'ok' in body && typeof (body as { ok: unknown }).ok === 'boolean';
}

async function request<T>(f: Fetch, url: string, init: RequestInit): Promise<ApiResult<T>> {
	try {
		const res = await f(url, init);
		const body: unknown = await res.json().catch(() => null);
		if (isApiResult(body)) return body as ApiResult<T>;
		return { ok: false, error: { code: 'INTERNAL', message: `Unexpected response (HTTP ${res.status})` } };
	} catch (e) {
		return { ok: false, error: { code: 'NETWORK', message: e instanceof Error ? e.message : 'Network error' } };
	}
}

export function toSearchParams(params: Record<string, unknown>): URLSearchParams {
	const qs = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null || value === '') continue;
		if (Array.isArray(value)) for (const v of value) qs.append(key, String(v));
		else qs.set(key, String(value));
	}
	return qs;
}

export function send<C extends CommandContract>(contract: C, input: InputOf<C>, f: Fetch = fetch): Promise<ApiResult<ResultOf<C>>> {
	return request(f, contract.path, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify(input)
	});
}

export function ask<Q extends QueryContract>(contract: Q, params: InputOf<Q>, f: Fetch = fetch): Promise<ApiResult<ResultOf<Q>>> {
	const qs = toSearchParams((params ?? {}) as Record<string, unknown>).toString();
	return request(f, qs ? `${contract.path}?${qs}` : contract.path, {
		method: 'GET',
		headers: { accept: 'application/json' }
	});
}

/** For `load` functions: a failed query becomes a SvelteKit error page. */
export async function askOrThrow<Q extends QueryContract>(contract: Q, params: InputOf<Q>, f: Fetch): Promise<ResultOf<Q>> {
	const result = await ask(contract, params, f);
	if (!result.ok) error(STATUS[result.error.code] ?? 500, result.error.message);
	return result.data;
}
