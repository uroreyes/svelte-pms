/** Extracts the SQLSTATE from a postgres.js error (possibly wrapped by Drizzle). */
export function pgErrorCode(error: unknown): string | undefined {
	let current: unknown = error;
	for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
		const code = (current as { code?: unknown }).code;
		if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
		current = (current as { cause?: unknown }).cause;
	}
	return undefined;
}

export const PG = {
	UNIQUE_VIOLATION: '23505',
	EXCLUSION_VIOLATION: '23P01',
	CHECK_VIOLATION: '23514',
	FOREIGN_KEY_VIOLATION: '23503',
	RAISE_EXCEPTION: 'P0001'
} as const;

/** constraint_name of a postgres.js error (possibly wrapped by Drizzle), else undefined. */
export function pgConstraintName(error: unknown): string | undefined {
	let current: unknown = error;
	for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
		const name = (current as { constraint_name?: unknown }).constraint_name;
		if (typeof name === 'string' && name.length > 0) return name;
		current = (current as { cause?: unknown }).cause;
	}
	return undefined;
}
