import { describe, expect, it } from 'vitest';
import { deriveEntity, redact } from './record';

describe('audit redaction & entity derivation', () => {
	it('redacts guest / payer PII recursively and masks payment references', () => {
		const out = redact({
			roomTypeId: 'rt',
			guest: { firstName: 'Ana', lastName: 'Cruz', email: 'a@b.co', phone: '' },
			idDocumentType: 'Passport',
			idDocumentNumber: 'P1234567',
			rooms: [{ adults: 2 }],
			settleWith: { method: 'CARD', referenceNo: 'AUTH-998877' },
			reason: 'Posted to wrong room'
		});
		expect(out).toEqual({
			roomTypeId: 'rt',
			guest: { firstName: '[redacted]', lastName: '[redacted]', email: '[redacted]', phone: '' },
			idDocumentType: 'Passport',
			idDocumentNumber: '[redacted]',
			rooms: [{ adults: 2 }],
			settleWith: { method: 'CARD', referenceNo: '…8877' },
			reason: 'Posted to wrong room'
		});
	});

	it('derives the most specific entity from input, then result', () => {
		expect(deriveEntity({ reservationId: 'r', roomUnitId: 'u' }, {})).toEqual({ entityType: 'reservation', entityId: 'r' });
		expect(deriveEntity({ itemId: 'i', reason: 'x' }, { reversalItemId: 'z' })).toEqual({ entityType: 'item', entityId: 'i' });
		expect(deriveEntity({ name: 'VAT' }, { taxRuleId: 't' })).toEqual({ entityType: 'taxRule', entityId: 't' });
		expect(deriveEntity({ id: 'c', name: 'Water' }, { catalogItemId: 'c' })).toEqual({ entityType: 'catalogItem', entityId: 'c' });
		expect(deriveEntity({}, {})).toEqual({ entityType: null, entityId: null });
	});
});
