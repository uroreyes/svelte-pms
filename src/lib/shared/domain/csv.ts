/** RFC 4180 CSV with an Excel-friendly BOM and spreadsheet formula-injection guard. */
export type CsvCell = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	// Text that a spreadsheet would execute as a formula is neutralised with a leading apostrophe.
	const text = FORMULA_START.test(value) ? `'${value}` : value;
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
	return '﻿' + [columns, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
