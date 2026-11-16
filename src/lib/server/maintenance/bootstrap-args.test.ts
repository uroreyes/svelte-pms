import { describe, expect, it } from 'vitest';
import { parseBootstrapArgs } from './bootstrap-args';

const REQUIRED = ['--property-name', 'Sea View', '--slug', 'sea-view', '--admin-email', ' Boss@Sea.Test '];

describe('parseBootstrapArgs', () => {
	it('lower-cases and trims the admin email and applies defaults', () => {
		expect(parseBootstrapArgs(REQUIRED)).toEqual({
			ok: true,
			args: {
				propertyName: 'Sea View',
				slug: 'sea-view',
				adminEmail: 'boss@sea.test',
				adminName: 'Administrator',
				timezone: 'UTC',
				currency: 'USD',
				allowExistingProperties: false
			}
		});
	});

	it('accepts every optional flag and flags in any order', () => {
		expect(
			parseBootstrapArgs([
				'--currency',
				'PHP',
				'--allow-existing-properties',
				'--timezone',
				'Asia/Manila',
				'--admin-name',
				'Ana Cruz',
				'--admin-email',
				'ana@sea.test',
				'--slug',
				'sea-view',
				'--property-name',
				'Sea View'
			])
		).toEqual({
			ok: true,
			args: {
				propertyName: 'Sea View',
				slug: 'sea-view',
				adminEmail: 'ana@sea.test',
				adminName: 'Ana Cruz',
				timezone: 'Asia/Manila',
				currency: 'PHP',
				allowExistingProperties: true
			}
		});
	});

	it.each([
		[['--slug', 'sea-view', '--admin-email', 'a@b.test'], 'Missing --property-name <name>'],
		[['--property-name', 'Sea View', '--admin-email', 'a@b.test'], 'Missing --slug <slug>'],
		[['--property-name', 'Sea View', '--slug', 'sea-view'], 'Missing --admin-email <email>']
	])('reports a missing required flag %j', (argv, error) => {
		expect(parseBootstrapArgs(argv)).toEqual({ ok: false, error });
	});

	it.each([
		[[...REQUIRED, '--confirm', 'yes'], 'Unknown argument: --confirm'],
		[['harbor-house'], 'Unknown argument: harbor-house'],
		[[...REQUIRED, '--password', 'x'], 'Unknown argument: --password'],
		[[...REQUIRED, '--slug', 'other'], 'Duplicate flag: --slug'],
		[[...REQUIRED, '--allow-existing-properties', '--allow-existing-properties'], 'Duplicate flag: --allow-existing-properties'],
		[['--property-name'], 'Missing value for --property-name'],
		[['--property-name', '--slug', 'sea-view', '--admin-email', 'a@b.test'], 'Missing value for --property-name'],
		[['--property-name', ' ', '--slug', 'sea-view', '--admin-email', 'a@b.test'], 'Missing value for --property-name']
	])('rejects %j', (argv, error) => {
		expect(parseBootstrapArgs(argv)).toEqual({ ok: false, error });
	});

	it.each([
		['Sea View', '--slug: Slug: lower-case letters, digits and hyphens (2–63 chars)'],
		['-x', '--slug: Slug: lower-case letters, digits and hyphens (2–63 chars)'],
		['a', '--slug: Slug: lower-case letters, digits and hyphens (2–63 chars)'],
		['a--b', '--slug: Slug: no double hyphens'],
		['a'.repeat(64), '--slug: Slug: lower-case letters, digits and hyphens (2–63 chars)']
	])('rejects slug %s', (slug, error) => {
		expect(parseBootstrapArgs(['--property-name', 'Sea View', '--slug', slug, '--admin-email', 'a@b.test'])).toEqual({
			ok: false,
			error
		});
	});

	it('rejects a bad admin email', () => {
		const r = parseBootstrapArgs(['--property-name', 'Sea View', '--slug', 'sea-view', '--admin-email', 'not-an-email']);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.startsWith('--admin-email: ')).toBe(true);
	});

	it('rejects an unknown timezone and a lower-case currency', () => {
		expect(parseBootstrapArgs([...REQUIRED, '--timezone', 'Mars/Base'])).toEqual({
			ok: false,
			error: '--timezone: Unknown IANA timezone'
		});
		expect(parseBootstrapArgs([...REQUIRED, '--currency', 'usd'])).toEqual({
			ok: false,
			error: '--currency: ISO 4217 code, e.g. USD'
		});
	});

	it.each(['night-audit@x.test', 'Night-Audit@X.test', 'ops@harbor.system', 'a@B.SYSTEM'])(
		'rejects reserved admin email %s',
		(email) => {
			expect(parseBootstrapArgs(['--property-name', 'Sea View', '--slug', 'sea-view', '--admin-email', email])).toEqual({
				ok: false,
				error: '--admin-email: reserved for the system user'
			});
		}
	);
});
