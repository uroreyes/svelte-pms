import { describe, expect, it } from 'vitest';
import { parseResetArgs } from './reset-args';

const BASE = ['--property', 'harbor-house', '--operator', 'admin@harbor.test'];

describe('parseResetArgs', () => {
	it('parses the minimal valid invocation (dry run)', () => {
		expect(parseResetArgs(BASE)).toEqual({
			ok: true,
			args: {
				propertySlug: 'harbor-house',
				operatorEmail: 'admin@harbor.test',
				confirm: null,
				force: false
			}
		});
	});

	it('parses every flag', () => {
		expect(parseResetArgs([...BASE, '--confirm', 'harbor-house', '--force'])).toEqual({
			ok: true,
			args: {
				propertySlug: 'harbor-house',
				operatorEmail: 'admin@harbor.test',
				confirm: 'harbor-house',
				force: true
			}
		});
	});

	it('accepts flags in any order', () => {
		expect(
			parseResetArgs(['--force', '--confirm', 'harbor-house', '--operator', 'admin@harbor.test', '--property', 'harbor-house'])
		).toMatchObject({ ok: true, args: { confirm: 'harbor-house', force: true } });
	});

	it('trims and lowercases the operator email only', () => {
		expect(
			parseResetArgs(['--property', 'Harbor-House', '--operator', ' Admin@Harbor.TEST '])
		).toEqual({
			ok: true,
			args: {
				propertySlug: 'Harbor-House',
				operatorEmail: 'admin@harbor.test',
				confirm: null,
				force: false
			}
		});
	});

	it('reports a missing --property', () => {
		expect(parseResetArgs(['--operator', 'admin@harbor.test'])).toEqual({
			ok: false,
			error: 'Missing --property <slug>'
		});
	});

	it('reports a missing --operator', () => {
		expect(parseResetArgs(['--property', 'harbor-house'])).toEqual({
			ok: false,
			error: 'Missing --operator <email>'
		});
	});

	it('reports a value flag with no value', () => {
		expect(parseResetArgs(['--property'])).toEqual({ ok: false, error: '--property requires a value' });
		expect(parseResetArgs(['--property', '--force', ...BASE.slice(2)])).toEqual({
			ok: false,
			error: '--property requires a value'
		});
		expect(parseResetArgs(['--property', 'harbor-house', '--operator'])).toEqual({
			ok: false,
			error: '--operator requires a value'
		});
		expect(parseResetArgs([...BASE, '--confirm'])).toEqual({
			ok: false,
			error: '--confirm requires a value'
		});
	});

	it('treats a flag as the missing value of --confirm', () => {
		expect(parseResetArgs([...BASE, '--confirm', '--force'])).toEqual({
			ok: false,
			error: '--confirm requires a value'
		});
	});

	it('treats a blank value as missing', () => {
		expect(parseResetArgs([...BASE, '--confirm', '   '])).toEqual({
			ok: false,
			error: '--confirm requires a value'
		});
	});

	it('rejects unknown arguments', () => {
		expect(parseResetArgs([...BASE, '--dry-run'])).toEqual({
			ok: false,
			error: 'Unknown argument: --dry-run'
		});
		expect(parseResetArgs([...BASE, 'stray'])).toEqual({
			ok: false,
			error: 'Unknown argument: stray'
		});
	});

	it('rejects the equals form', () => {
		expect(parseResetArgs(['--property=x', '--operator', 'admin@harbor.test'])).toEqual({
			ok: false,
			error: 'Unknown argument: --property=x'
		});
	});

	it('rejects duplicate flags', () => {
		expect(parseResetArgs([...BASE, '--force', '--force'])).toEqual({
			ok: false,
			error: 'Duplicate argument: --force'
		});
		expect(parseResetArgs([...BASE, '--property', 'other'])).toEqual({
			ok: false,
			error: 'Duplicate argument: --property'
		});
	});

	it('returns no arguments as a missing --property', () => {
		expect(parseResetArgs([])).toEqual({ ok: false, error: 'Missing --property <slug>' });
	});
});
