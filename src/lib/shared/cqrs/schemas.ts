/** Reusable Zod primitives for contracts. */
import { z } from 'zod';
import { isIsoDate } from '../domain/dates';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../domain/staff';

export const isoDate = z.string().refine(isIsoDate, { message: 'Expected a date (YYYY-MM-DD)' });
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');
export const id = z.uuid();
export const cents = z.number().int().min(0).max(100_000_000);
export const positiveCents = z.number().int().min(1).max(100_000_000);
export const shortText = (max = 120) => z.string().trim().min(1).max(max);
export const optionalText = (max = 500) =>
	z
		.string()
		.trim()
		.max(max)
		.optional()
		.transform((v) => (v ? v : undefined));

/** Staff email: trimmed, lower-cased (email uniqueness is case-insensitive by convention). */
export const staffEmail = z
	.string()
	.trim()
	.toLowerCase()
	.pipe(z.email().max(254));

/** Staff display name. */
export const staffName = shortText(80);

/** IANA timezone name, validated by the runtime Intl database. */
export const ianaTimezone = z.string().refine(
	(tz) => {
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: tz });
			return true;
		} catch {
			return false;
		}
	},
	{ message: 'Unknown IANA timezone' }
);

/** ISO 4217 currency code, e.g. USD. */
export const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code, e.g. USD');

/** Public booking URL segment: lower-case letters, digits, single hyphens; 2–63 chars. */
export const propertySlug = z
	.string()
	.trim()
	.regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/, 'Slug: lower-case letters, digits and hyphens (2–63 chars)')
	.refine((s) => !s.includes('--'), 'Slug: no double hyphens');

/** Staff password: min length, not padding-only, at least 4 distinct characters. Value is not trimmed. */
export const staffPassword = z
	.string()
	.min(PASSWORD_MIN_LENGTH, 'Password must be at least 12 characters')
	.max(PASSWORD_MAX_LENGTH)
	.refine(
		(v) => v.trim().length >= PASSWORD_MIN_LENGTH && new Set(v).size >= 4,
		'Choose a less repetitive password'
	);

/** Query-string friendly integer. */
export const qsInt = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

export const guestInput = z.object({
	firstName: shortText(60),
	lastName: shortText(60),
	email: z
		.email()
		.max(254)
		.optional()
		.or(z.literal('').transform(() => undefined)),
	phone: z
		.string()
		.trim()
		.max(40)
		.regex(/^[0-9+()\-.\s]*$/, 'Invalid phone number')
		.optional()
		.transform((v) => (v ? v : undefined))
});

export const party = {
	adults: z.number().int().min(1).max(20),
	children: z.number().int().min(0).max(20).default(0)
};

/** Escape LIKE wildcards in user search input. */
export function likePattern(term: string): string {
	return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
