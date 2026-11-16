/** Mask prefix shown in place of the hidden part of an ID document number. */
const MASK = '••••';

/**
 * Last 4 code points of the ID document number as entered.
 * Returns null when the value has 4 or fewer code points (nothing is revealed).
 */
export function idDocumentLast4(value: string): string | null {
	const chars = Array.from(value);
	if (chars.length <= 4) return null;
	return chars.slice(-4).join('');
}

/**
 * Read-model mask. `hasNumber` comes from the stored ciphertext presence,
 * `last4` from the plaintext-derived column. Never reveals more than last4.
 */
export function maskIdDocument(hasNumber: boolean, last4: string | null): string | null {
	if (!hasNumber) return null;
	return last4 === null ? MASK : MASK + last4;
}
