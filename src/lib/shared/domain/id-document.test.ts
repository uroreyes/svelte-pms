import { describe, expect, it } from 'vitest';
import { idDocumentLast4, maskIdDocument } from './id-document';

describe('id-document', () => {
	it('keeps the last 4 code points of the value', () => {
		expect(idDocumentLast4('X1234567')).toBe('4567');
		expect(idDocumentLast4('12345')).toBe('2345');
		expect(idDocumentLast4('AB€€€€')).toBe('€€€€');
	});

	it('returns null when the value is 4 code points or fewer', () => {
		expect(idDocumentLast4('99')).toBeNull();
		expect(idDocumentLast4('1234')).toBeNull();
		expect(idDocumentLast4('')).toBeNull();
	});

	it('masks with fixed dots and last4 when present', () => {
		expect(maskIdDocument(true, '1234')).toBe('••••1234');
		expect(maskIdDocument(true, null)).toBe('••••');
		expect(maskIdDocument(false, null)).toBeNull();
	});
});
