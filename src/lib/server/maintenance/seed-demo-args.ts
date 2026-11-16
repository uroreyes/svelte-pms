export interface DemoSeedArgs {
	propertySlug: string;
	/** Lower-cased; null → the property's first active, non-system ADMIN. */
	operatorEmail: string | null;
	count: number;
}

export type DemoSeedParseResult = { ok: true; args: DemoSeedArgs } | { ok: false; error: string };

export const DEMO_DEFAULT_COUNT = 10;
export const DEMO_MAX_COUNT = 50;

const VALUE_FLAGS = ['--property', '--operator', '--count'] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];
const isValueFlag = (t: string): t is ValueFlag => (VALUE_FLAGS as readonly string[]).includes(t);

/** Pure parser for the `seed-demo` CLI. Space-separated form only; the first problem found is reported. */
export function parseDemoSeedArgs(argv: readonly string[]): DemoSeedParseResult {
	const seen = new Map<ValueFlag, string>();
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i]!;
		if (!isValueFlag(token)) return { ok: false, error: `Unknown argument: ${token}` };
		if (seen.has(token)) return { ok: false, error: `Duplicate flag: ${token}` };
		const value = argv[i + 1];
		if (value === undefined || value.startsWith('--') || value.trim() === '') return { ok: false, error: `Missing value for ${token}` };
		seen.set(token, value.trim());
		i++;
	}
	const property = seen.get('--property');
	if (!property) return { ok: false, error: 'Missing --property <slug>' };
	const rawCount = seen.get('--count');
	const count = rawCount === undefined ? DEMO_DEFAULT_COUNT : Number(rawCount);
	if (!Number.isInteger(count) || count < 1 || count > DEMO_MAX_COUNT) {
		return { ok: false, error: `--count must be a whole number from 1 to ${DEMO_MAX_COUNT}` };
	}
	return { ok: true, args: { propertySlug: property, operatorEmail: seen.get('--operator')?.toLowerCase() ?? null, count } };
}
