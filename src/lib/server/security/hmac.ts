import { createHmac, timingSafeEqual } from 'node:crypto';

export function signBody(body: string, secret: string): string {
	return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/** Constant-time verification of `sha256=<hex>` signatures. */
export function verifySignature(body: string, signature: string | null, secret: string): boolean {
	if (!signature || !secret) return false;
	const expected = Buffer.from(signBody(body, secret));
	const given = Buffer.from(signature.trim());
	return expected.length === given.length && timingSafeEqual(expected, given);
}
