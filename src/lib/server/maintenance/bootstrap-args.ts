import type { ZodType } from 'zod';
import { currencyCode, ianaTimezone, propertySlug, shortText, staffEmail, staffName } from '$lib/shared/cqrs/schemas';

export interface BootstrapArgs {
	propertyName: string;
	slug: string;
	/** Lower-cased; never a reserved system address. */
	adminEmail: string;
	adminName: string;
	timezone: string;
	currency: string;
	allowExistingProperties: boolean;
}

export type BootstrapParseResult = { ok: true; args: BootstrapArgs } | { ok: false; error: string };

const VALUE_FLAGS = ['--property-name', '--slug', '--admin-email', '--admin-name', '--timezone', '--currency'] as const;
const BOOLEAN_FLAG = '--allow-existing-properties';
type ValueFlag = (typeof VALUE_FLAGS)[number];

const isValueFlag = (token: string): token is ValueFlag => (VALUE_FLAGS as readonly string[]).includes(token);

/** Night-audit system user (migration 0007) and any `*.system` address are not valid admin logins. */
const isReservedEmail = (email: string): boolean => email.startsWith('night-audit@') || email.endsWith('.system');

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

function check<T>(flag: ValueFlag, schema: ZodType<T>, raw: string): Checked<T> {
	const result = schema.safeParse(raw);
	if (result.success) return { ok: true, value: result.data };
	return { ok: false, error: `${flag}: ${result.error.issues[0]?.message ?? 'invalid value'}` };
}

interface Tokens {
	values: Map<ValueFlag, string>;
	allowExistingProperties: boolean;
}

/** Reads flag tokens only; validation happens afterwards. The first problem found is reported. */
function readTokens(argv: readonly string[]): { ok: true; tokens: Tokens } | { ok: false; error: string } {
	const values = new Map<ValueFlag, string>();
	let allowExistingProperties = false;
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i]!;
		if (token === BOOLEAN_FLAG) {
			if (allowExistingProperties) return { ok: false, error: `Duplicate flag: ${token}` };
			allowExistingProperties = true;
			continue;
		}
		if (!isValueFlag(token)) return { ok: false, error: `Unknown argument: ${token}` };
		if (values.has(token)) return { ok: false, error: `Duplicate flag: ${token}` };
		const value = argv[i + 1];
		if (value === undefined || value.startsWith('--') || value.trim() === '') {
			return { ok: false, error: `Missing value for ${token}` };
		}
		values.set(token, value.trim());
		i++;
	}
	return { ok: true, tokens: { values, allowExistingProperties } };
}

/** Pure parser for the `bootstrap` CLI. Space-separated form only. The password is never an argument. */
export function parseBootstrapArgs(argv: readonly string[]): BootstrapParseResult {
	const read = readTokens(argv);
	if (!read.ok) return read;
	const { values, allowExistingProperties } = read.tokens;

	const rawName = values.get('--property-name');
	if (rawName === undefined) return { ok: false, error: 'Missing --property-name <name>' };
	const rawSlug = values.get('--slug');
	if (rawSlug === undefined) return { ok: false, error: 'Missing --slug <slug>' };
	const rawEmail = values.get('--admin-email');
	if (rawEmail === undefined) return { ok: false, error: 'Missing --admin-email <email>' };

	const name = check('--property-name', shortText(120), rawName);
	if (!name.ok) return name;
	const slug = check('--slug', propertySlug, rawSlug);
	if (!slug.ok) return slug;
	const email = check('--admin-email', staffEmail, rawEmail);
	if (!email.ok) return email;
	if (isReservedEmail(email.value)) return { ok: false, error: '--admin-email: reserved for the system user' };
	const adminName = check('--admin-name', staffName, values.get('--admin-name') ?? 'Administrator');
	if (!adminName.ok) return adminName;
	const timezone = check('--timezone', ianaTimezone, values.get('--timezone') ?? 'UTC');
	if (!timezone.ok) return timezone;
	const currency = check('--currency', currencyCode, values.get('--currency') ?? 'USD');
	if (!currency.ok) return currency;

	return {
		ok: true,
		args: {
			propertyName: name.value,
			slug: slug.value,
			adminEmail: email.value,
			adminName: adminName.value,
			timezone: timezone.value,
			currency: currency.value,
			allowExistingProperties
		}
	};
}
