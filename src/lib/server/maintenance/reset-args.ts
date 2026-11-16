export interface ResetArgs {
	propertySlug: string;
	operatorEmail: string;
	confirm: string | null;
	force: boolean;
}

export type ParseResult = { ok: true; args: ResetArgs } | { ok: false; error: string };

const VALUE_FLAGS = ['--property', '--operator', '--confirm'] as const;
const BOOLEAN_FLAGS = ['--force'] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];
type Flag = ValueFlag | (typeof BOOLEAN_FLAGS)[number];

interface Parsed {
	property: string | null;
	operator: string | null;
	confirm: string | null;
	force: boolean;
}

const EMPTY: Parsed = { property: null, operator: null, confirm: null, force: false };

const isFlagToken = (token: string): boolean => token.startsWith('--');

const isValueFlag = (token: string): token is ValueFlag =>
	(VALUE_FLAGS as readonly string[]).includes(token);

const isBooleanFlag = (token: string): token is (typeof BOOLEAN_FLAGS)[number] =>
	(BOOLEAN_FLAGS as readonly string[]).includes(token);

const isKnownFlag = (token: string): token is Flag => isValueFlag(token) || isBooleanFlag(token);

/** Returns the flag's value when present; `null` when the next token is absent, blank or another flag. */
const valueAfter = (argv: readonly string[], index: number): string | null => {
	const next = argv[index + 1];
	if (next === undefined || isFlagToken(next) || next.trim() === '') return null;
	return next;
};

class ArgError extends Error {}

/**
 * Pure parser for the `reset-operational-data` CLI. Only the space-separated form is accepted.
 * Tokens are consumed left to right; the first problem found is reported.
 */
export function parseResetArgs(argv: readonly string[]): ParseResult {
	try {
		const parsed = consume(argv);
		if (parsed.property === null) throw new ArgError('Missing --property <slug>');
		if (parsed.operator === null) throw new ArgError('Missing --operator <email>');
		return {
			ok: true,
			args: {
				propertySlug: parsed.property,
				operatorEmail: parsed.operator.trim().toLowerCase(),
				confirm: parsed.confirm,
				force: parsed.force
			}
		};
	} catch (err) {
		if (err instanceof ArgError) return { ok: false, error: err.message };
		throw err;
	}
}

function consume(argv: readonly string[]): Parsed {
	const seen = new Set<Flag>();
	let state = EMPTY;
	let index = 0;
	while (index < argv.length) {
		const token = argv[index] as string;
		if (!isKnownFlag(token)) throw new ArgError(`Unknown argument: ${token}`);
		if (seen.has(token)) throw new ArgError(`Duplicate argument: ${token}`);
		seen.add(token);
		if (isBooleanFlag(token)) {
			state = { ...state, force: true };
			index += 1;
			continue;
		}
		const value = valueAfter(argv, index);
		if (value === null) throw new ArgError(`${token} requires a value`);
		state = withValue(state, token, value);
		index += 2;
	}
	return state;
}

function withValue(state: Parsed, flag: ValueFlag, value: string): Parsed {
	switch (flag) {
		case '--property':
			return { ...state, property: value };
		case '--operator':
			return { ...state, operator: value };
		case '--confirm':
			return { ...state, confirm: value };
	}
}
