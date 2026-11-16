import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('csv', () => {
	it('quotes separators and doubles quotes', () => {
		expect(csvCell('a,b')).toBe('"a,b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
		expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
		expect(csvCell(null)).toBe('');
	});

	it('neutralises spreadsheet formulas in text but keeps numbers', () => {
		expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
		expect(csvCell('+1 555')).toBe("'+1 555");
		expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
		expect(csvCell(-12.5)).toBe('-12.5');
	});

	it('emits a BOM + CRLF rows for Excel', () => {
		expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('﻿a,b\r\n1,x\r\n');
	});
});
