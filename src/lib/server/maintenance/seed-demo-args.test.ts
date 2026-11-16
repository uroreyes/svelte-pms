import { describe, expect, it } from 'vitest';
import { DEMO_DEFAULT_COUNT, parseDemoSeedArgs } from './seed-demo-args';

describe('parseDemoSeedArgs', () => {
	it('defaults operator to null and count to the default', () => {
		expect(parseDemoSeedArgs(['--property', 'harbor-house'])).toEqual({
			ok: true,
			args: { propertySlug: 'harbor-house', operatorEmail: null, count: DEMO_DEFAULT_COUNT }
		});
	});

	it('lower-cases the operator and parses count', () => {
		expect(parseDemoSeedArgs(['--count', '4', '--operator', 'Admin@Harbor.TEST', '--property', 'hh'])).toEqual({
			ok: true,
			args: { propertySlug: 'hh', operatorEmail: 'admin@harbor.test', count: 4 }
		});
	});

	it.each([
		[[], 'Missing --property <slug>'],
		[['--property'], 'Missing value for --property'],
		[['--property', '--count', '3'], 'Missing value for --property'],
		[['--property', ' '], 'Missing value for --property'],
		[['--property', 'a', '--property', 'b'], 'Duplicate flag: --property'],
		[['--property', 'a', '--confirm', 'a'], 'Unknown argument: --confirm'],
		[['harbor-house'], 'Unknown argument: harbor-house']
	])('rejects %j', (argv, error) => {
		expect(parseDemoSeedArgs(argv)).toEqual({ ok: false, error });
	});

	it.each(['0', '51', '2.5', 'ten', '-1'])('rejects --count %s', (count) => {
		const r = parseDemoSeedArgs(['--property', 'hh', '--count', count]);
		expect(r).toEqual({ ok: false, error: '--count must be a whole number from 1 to 50' });
	});
});
